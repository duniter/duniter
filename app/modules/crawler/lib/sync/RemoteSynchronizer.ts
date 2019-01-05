// Source file from duniter: Crypto-currency software to manage libre currency such as Ğ1
// Copyright (C) 2018  Cedric Moreau <cem.moreau@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

import {ISyncDownloader} from "./ISyncDownloader"
import {BlockDTO} from "../../../../lib/dto/BlockDTO"
import {PeerDTO} from "../../../../lib/dto/PeerDTO"
import {connect} from "../connect"
import {NewLogger} from "../../../../lib/logger"
import {cliprogram} from "../../../../lib/common-libs/programOptions"
import {Watcher} from "./Watcher"
import {PeeringService} from "../../../../service/PeeringService"
import {Server} from "../../../../../server"
import {DBPeer, JSONDBPeer} from "../../../../lib/db/DBPeer"
import {Underscore} from "../../../../lib/common-libs/underscore"
import {FileDAL} from "../../../../lib/dal/fileDAL"
import {P2PSyncDownloader} from "./P2PSyncDownloader"
import {FsSyncDownloader} from "./FsSyncDownloader"
import {AbstractSynchronizer} from "./AbstractSynchronizer"
import {pullSandboxToLocalServer} from "../sandbox"
import * as path from 'path'
import {IRemoteContacter} from "./IRemoteContacter"
import {BMARemoteContacter} from "./BMARemoteContacter"
import {WS2PConnection, WS2PPubkeyRemoteAuth, WS2PPubkeySyncLocalAuth} from "../../../ws2p/lib/WS2PConnection"
import {WS2PRequester} from "../../../ws2p/lib/WS2PRequester"
import {WS2PMessageHandler} from "../../../ws2p/lib/impl/WS2PMessageHandler"
import {WS2PResponse} from "../../../ws2p/lib/impl/WS2PResponse"
import {DataErrors} from "../../../../lib/common-libs/errors"
import {KeyGen} from "../../../../lib/common-libs/crypto/keyring"
import {WS2PRemoteContacter} from "./WS2PRemoteContacter"
import {Keypair} from "../../../../lib/dto/ConfDTO"

const logger = NewLogger()

export class RemoteSynchronizer extends AbstractSynchronizer {

  private currency:string
  private node:IRemoteContacter
  private peer:PeerDTO
  private shuffledPeers: JSONDBPeer[]
  private theP2pDownloader: ISyncDownloader
  private theFsDownloader: ISyncDownloader
  private to: number
  private localNumber: number
  private watcher: Watcher
  private endpoint: string = ""
  private hasMilestonesPages: boolean|undefined
  private milestones: { [k: number]: BlockDTO } = {}
  private milestonesPerPage = 1
  private maxPage = 0

  constructor(
    private host: string,
    private port: number,
    private server:Server,
    chunkSize: number,
    private noShufflePeers = false,
    private otherDAL?:FileDAL,
    private allowLocalSync = false,
  ) {
    super(chunkSize)
  }

  get dal(): FileDAL {
    return this.server.dal
  }

  get readDAL(): FileDAL {
    return this.otherDAL || this.dal
  }

  get PeeringService(): PeeringService {
    return this.server.PeeringService
  }

  getCurrency(): string {
    return this.currency || 'unknown-currency'
  }

  getPeer(): PeerDTO {
    return this.node as any
  }

  setWatcher(watcher: Watcher): void {
    this.watcher = watcher
  }

  getChunksPath(): string {
    return this.getCurrency()
  }

  async init(): Promise<void> {
    const syncApi = await RemoteSynchronizer.getSyncAPI([{ host: this.host, port: this.port }], this.server.conf.pair)
    if (!syncApi.api) {
      this.watcher.syncFailCannotConnectToRemote()
      throw Error(DataErrors[DataErrors.CANNOT_CONNECT_TO_REMOTE_FOR_SYNC])
    }
    this.currency = syncApi.currency
    this.endpoint = syncApi.endpoint
    this.node = syncApi.api
    this.peer = PeerDTO.fromJSONObject(syncApi.peering)
    logger.info("Try with %s %s", this.peer.getURL(), this.peer.pubkey.substr(0, 6))
    // We save this peer as a trusted peer for future contact
    try {
      await this.server.PeeringService.submitP(DBPeer.fromPeerDTO(this.peer), false, false, true)
    } catch (e) {
      logger.debug(e)
    }
    ;(this.node as any).pubkey = this.peer.pubkey
  }

  public static async getSyncAPI(hosts: { isBMA?: boolean, isWS2P?: boolean, host: string, port: number, path?: string }[], keypair: Keypair) {
    let api: IRemoteContacter|undefined
    let peering: any
    let endpoint = ""
    for (const access of hosts) {
      const host = access.host
      const port = access.port
      const path = access.path
      logger.info(`Connecting to address ${host} :${port}...`)

      // If we know this is a WS2P connection, don't try BMA
      if (access.isWS2P !== true) {
        try {
          const contacter = await connect(PeerDTO.fromJSONObject({ endpoints: [`BASIC_MERKLED_API ${host} ${port}${path && ' ' + path || ''}`]}), 3000)
          peering = await contacter.getPeer()
          api = new BMARemoteContacter(contacter)
          endpoint = 'BASIC_MERKLED_API ' + host + ' ' + port + ((path && ' ' + path) || '')
        } catch (e) {
        }
      }

      // If BMA is unreachable and the connection is not marked as strict BMA, let's try WS2P
      if (!api && access.isBMA !== true) {
        const pair = KeyGen(keypair.pub, keypair.sec)
        const connection = WS2PConnection.newConnectionToAddress(1,
          `ws://${host}:${port}${path && ' ' + path || ''}`,
          new (class SyncMessageHandler implements WS2PMessageHandler {
            async answerToRequest(json: any, c: WS2PConnection): Promise<WS2PResponse> {
              throw Error(DataErrors[DataErrors.CANNOT_ARCHIVE_CHUNK_WRONG_SIZE])
            }
            async handlePushMessage(json: any, c: WS2PConnection): Promise<void> {
              logger.warn('Receiving push messages, which are not allowed during a SYNC.', json)
            }
          }),
          new WS2PPubkeySyncLocalAuth("", pair, '00000000'),
          new WS2PPubkeyRemoteAuth("", pair), // The currency will be set by the remote node
          undefined
        )
        try {
          const requester = WS2PRequester.fromConnection(connection)
          peering = await requester.getPeer()
          api = new WS2PRemoteContacter(requester)
          endpoint = 'WS2P 99999999 ' + host + ' ' + port + ((path && ' ' + path) || '')
        } catch (e) {
        }
      }
      // If we have a working API: stop!
      if (api && peering) {
        break;
      }
    }
    if (!api) {
      throw Error(DataErrors[DataErrors.CANNOT_CONNECT_TO_REMOTE_FOR_SYNC])
    }
    if (!peering) {
      throw Error(DataErrors[DataErrors.NO_PEERING_AVAILABLE_FOR_SYNC])
    }
    return {
      api,
      peering,
      endpoint,
      currency: peering.currency
    }
  }

  async initWithKnownLocalAndToAndCurrency(to: number, localNumber: number): Promise<void> {
    this.to = to
    this.localNumber = localNumber
    //=======
    // Peers (just for P2P download)
    //=======
    let peers:(JSONDBPeer|null)[] = [];
    const p2psync = !cliprogram.nop2p
    if (p2psync) {
      this.watcher.writeStatus('Peers...');
      peers = await this.node.getPeers()
    }

    // Add current peer if it is not returned (example of a local node)
    peers.push({
      version: 1,
      currency: '',
      status: 'UP',
      first_down: null,
      last_try: null,
      pubkey: '',
      block: '',
      signature: '',
      endpoints: [this.endpoint]
    })

    peers = peers.filter(p => {
      if (!p) return false
      let hasWS2P = false
      let hasBMA = false
      for (const e of p.endpoints) {
        if (e.indexOf('MERKLED')) {
          hasBMA = true
        }
        if (e.indexOf('WS2P') !== -1) {
          hasWS2P = true
        }
      }
      return (hasWS2P || hasBMA) && p.status === 'UP'
    })

    if (!peers.length) {
      peers.push(DBPeer.fromPeerDTO(this.peer))
    }
    this.shuffledPeers = (this.noShufflePeers ? peers : Underscore.shuffle(peers)).filter(p => !!(p)) as JSONDBPeer[]
  }

  p2pDownloader(): ISyncDownloader {
    if (!this.theP2pDownloader) {
      this.theP2pDownloader = new P2PSyncDownloader(this.currency, this.server.conf.pair, this.localNumber, this.to, this.shuffledPeers, this.watcher, logger, this.chunkSize, this.allowLocalSync)
    }
    return this.theP2pDownloader
  }

  fsDownloader(): ISyncDownloader {
    if (!this.theFsDownloader) {
      this.theFsDownloader = new FsSyncDownloader(this.readDAL.fs, path.join(this.readDAL.rootPath, this.getChunksPath()), this.getChunkName.bind(this), this.chunkSize)
    }
    return this.theFsDownloader
  }

  getCurrent(): Promise<BlockDTO|null> {
    return this.node.getCurrent()
  }

  getBlock(number: number): Promise<BlockDTO|null> {
    return this.node.getBlock(number)
  }

  async getMilestone(number: number): Promise<BlockDTO|null> {
    if (this.hasMilestonesPages === undefined) {
      try {
        const mlPage = await this.node.getMilestonesPage()
        this.hasMilestonesPages = mlPage.chunkSize === this.chunkSize
        this.milestonesPerPage = mlPage.milestonesPerPage
        this.maxPage = mlPage.totalPages
      } catch (e) {
        this.hasMilestonesPages = false
      }
    }
    if (!this.hasMilestonesPages) {
      return this.getBlock(number)
    }
    if (this.milestones[number]) {
      return this.milestones[number]
    }

    if ((number + 1) % this.chunkSize !== 0) {
      // Something went wrong: we cannot rely on milestones method
      this.hasMilestonesPages = false
      return this.getBlock(number)
    }
    const chunkNumber = (number + 1) / this.chunkSize
    const pageNumber = (chunkNumber - (chunkNumber % this.milestonesPerPage)) / this.milestonesPerPage + 1
    if (pageNumber > this.maxPage) {
      // The page is not available: we cannot rely on milestones method at this point
      this.hasMilestonesPages = false
      return this.getBlock(number)
    }
    const mlPage = await this.node.getMilestones(pageNumber)
    mlPage.blocks.forEach(b => this.milestones[b.number] = b)
    if (this.milestones[number]) {
      return this.milestones[number]
    }
    // Even after the download, it seems we don't have our milestone. We will download normally.
    this.hasMilestonesPages = false
    return this.getBlock(number)
  }

  static async test(host: string, port: number, keypair: Keypair): Promise<BlockDTO> {
    const syncApi = await RemoteSynchronizer.getSyncAPI([{ host, port }], keypair)
    const current = await syncApi.api.getCurrent()
    if (!current) {
      throw Error(DataErrors[DataErrors.REMOTE_HAS_NO_CURRENT_BLOCK])
    }
    return current
  }

  async syncPeers(fullSync: boolean, to?: number): Promise<void> {
    const peers = await this.node.getPeers()
    for (let i = 0; i < peers.length; i++) {
      const peer = PeerDTO.fromJSONObject(peers[i])
      this.watcher.writeStatus('Peer ' + peer.pubkey)
      this.watcher.peersPercent(Math.ceil(i / peers.length * 100))
      try {
        await this.PeeringService.submitP(DBPeer.fromPeerDTO(peer))
      } catch (e) {
      }
    }
    this.watcher.peersPercent(100)
  }

  async syncSandbox(): Promise<void> {
    this.watcher.writeStatus('Synchronizing the sandboxes...');
    await pullSandboxToLocalServer(this.currency, this.node, this.server, this.server.logger, this.watcher, 1, false)
  }
}
