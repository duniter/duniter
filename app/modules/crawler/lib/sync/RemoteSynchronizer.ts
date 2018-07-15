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
import {Contacter} from "../contacter"
import {connect} from "../connect"
import {NewLogger} from "../../../../lib/logger"
import {CrawlerConstants} from "../constants"
import {HttpMerkleOfPeers} from "../../../bma/lib/dtos"
import {cliprogram} from "../../../../lib/common-libs/programOptions"
import {Watcher} from "./Watcher"
import {dos2unix} from "../../../../lib/common-libs/dos2unix"
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

const logger = NewLogger()

export class RemoteSynchronizer extends AbstractSynchronizer {

  private node:Contacter
  private peer:PeerDTO
  private shuffledPeers: JSONDBPeer[]
  private theP2pDownloader: ISyncDownloader
  private theFsDownloader: ISyncDownloader
  private to: number
  private localNumber: number
  private currency: string
  private watcher: Watcher
  private static contacterOptions = {
    timeout: CrawlerConstants.SYNC_LONG_TIMEOUT
  }

  constructor(
    private host: string,
    private port: number,
    private server:Server,
    private noShufflePeers = false,
    private otherDAL?:FileDAL,
  ) {
    super()
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
    return this.currency
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
    const peering = await Contacter.fetchPeer(this.host, this.port, RemoteSynchronizer.contacterOptions)
    this.peer = PeerDTO.fromJSONObject(peering)
    // We save this peer as a trusted peer for future contact
    await this.server.PeeringService.submitP(DBPeer.fromPeerDTO(this.peer), false, false, true)
    logger.info("Try with %s %s", this.peer.getURL(), this.peer.pubkey.substr(0, 6))
    this.node = await connect(this.peer)
    ;(this.node as any).pubkey = this.peer.pubkey
    this.watcher.writeStatus('Connecting to ' + this.host + '...')
  }

  async initWithKnownLocalAndToAndCurrency(to: number, localNumber: number, currency: string): Promise<void> {
    this.to = to
    this.localNumber = localNumber
    this.currency = currency
    //=======
    // Peers (just for P2P download)
    //=======
    let peers:(JSONDBPeer|null)[] = [];
    if (!cliprogram.nopeers && (to - localNumber > 1000)) { // P2P download if more than 1000 blocs
      this.watcher.writeStatus('Peers...');
      const merkle = await this.dal.merkleForPeers();
      const getPeers:(params:any) => Promise<HttpMerkleOfPeers> = this.node.getPeers.bind(this.node);
      const json2 = await getPeers({});
      const rm = new NodesMerkle(json2);
      if(rm.root() != merkle.root()){
        const leavesToAdd:string[] = [];
        const json = await getPeers({ leaves: true });
        json.leaves.forEach((leaf:string) => {
          if(merkle.leaves().indexOf(leaf) == -1){
            leavesToAdd.push(leaf);
          }
        });
        peers = await Promise.all(leavesToAdd.map(async (leaf) => {
          try {
            const json3 = await getPeers({ "leaf": leaf });
            const jsonEntry = json3.leaf.value;
            const endpoint = jsonEntry.endpoints[0];
            this.watcher.writeStatus('Peer ' + endpoint);
            return jsonEntry;
          } catch (e) {
            logger.warn("Could not get peer of leaf %s, continue...", leaf);
            return null;
          }
        }))
      }
      else {
        this.watcher.writeStatus('Peers already known');
      }
    }

    if (!peers.length) {
      peers.push(DBPeer.fromPeerDTO(this.peer))
    }
    peers = peers.filter((p) => p);
    this.shuffledPeers = (this.noShufflePeers ? peers : Underscore.shuffle(peers)).filter(p => !!(p)) as JSONDBPeer[]
  }

  p2pDownloader(): ISyncDownloader {
    if (!this.theP2pDownloader) {
      this.theP2pDownloader = new P2PSyncDownloader(this.localNumber, this.to, this.shuffledPeers, this.watcher, logger)
    }
    return this.theP2pDownloader
  }

  fsDownloader(): ISyncDownloader {
    if (!this.theFsDownloader) {
      this.theFsDownloader = new FsSyncDownloader(this.readDAL.fs, path.join(this.readDAL.rootPath, this.getChunksPath()), this.getChunkName.bind(this))
    }
    return this.theFsDownloader
  }

  getCurrent(): Promise<BlockDTO|null> {
    return this.node.getCurrent()
  }

  getBlock(number: number): Promise<BlockDTO|null> {
    return this.node.getBlock(number)
  }

  static async test(host: string, port: number): Promise<BlockDTO> {
    const peering = await Contacter.fetchPeer(host, port, this.contacterOptions);
    const node = await connect(PeerDTO.fromJSONObject(peering));
    return node.getCurrent()
  }

  async syncPeers(fullSync: boolean, to?: number): Promise<void> {
    if (!cliprogram.nopeers && fullSync) {

      const peering = await Contacter.fetchPeer(this.host, this.port, RemoteSynchronizer.contacterOptions);

      let peer = PeerDTO.fromJSONObject(peering);
      logger.info("Try with %s %s", peer.getURL(), peer.pubkey.substr(0, 6));
      let node:any = await connect(peer);
      node.pubkey = peer.pubkey;
      logger.info('Sync started.');

      this.watcher.writeStatus('Peers...');
      await this.syncPeer(node);
      const merkle = await this.dal.merkleForPeers();
      const getPeers:(params:any) => Promise<HttpMerkleOfPeers> = node.getPeers.bind(node);
      const json2 = await getPeers({});
      const rm = new NodesMerkle(json2);
      if(rm.root() != merkle.root()){
        const leavesToAdd:string[] = [];
        const json = await getPeers({ leaves: true });
        json.leaves.forEach((leaf:string) => {
          if(merkle.leaves().indexOf(leaf) == -1){
            leavesToAdd.push(leaf);
          }
        });
        for (let i = 0; i < leavesToAdd.length; i++) {
          try {
            const leaf = leavesToAdd[i]
            const json3 = await getPeers({ "leaf": leaf });
            const jsonEntry = json3.leaf.value;
            const sign = json3.leaf.value.signature;
            const entry:any = {};
            entry.version = jsonEntry.version
            entry.currency = jsonEntry.currency
            entry.pubkey = jsonEntry.pubkey
            entry.endpoints = jsonEntry.endpoints
            entry.block = jsonEntry.block
            entry.signature = sign;
            this.watcher.writeStatus('Peer ' + entry.pubkey);
            this.watcher.peersPercent((i + 1) / leavesToAdd.length * 100)
            await this.PeeringService.submitP(entry, false, to === undefined);
          } catch (e) {
            logger.warn(e && e.message || e)
          }
        }
        this.watcher.peersPercent(100)
      }
      else {
        this.watcher.writeStatus('Peers already known');
      }
    }
  }

  //============
  // Peer
  //============
  private async syncPeer (node:any) {

    // Global sync vars
    const remotePeer = PeerDTO.fromJSONObject({});
    const json = await node.getPeer();
    remotePeer.version = json.version
    remotePeer.currency = json.currency
    remotePeer.pubkey = json.pub
    remotePeer.endpoints = json.endpoints
    remotePeer.blockstamp = json.block
    remotePeer.signature = json.signature
    const entry = remotePeer.getRawUnsigned();
    const signature = dos2unix(remotePeer.signature);
    // Parameters
    if(!(entry && signature)){
      throw 'Requires a peering entry + signature';
    }

    let remoteJsonPeer:any = json
    remoteJsonPeer.pubkey = json.pubkey;
    let signatureOK = this.PeeringService.checkPeerSignature(remoteJsonPeer);
    if (!signatureOK) {
      this.watcher.writeStatus('Wrong signature for peer #' + remoteJsonPeer.pubkey);
    }
    try {
      await this.PeeringService.submitP(remoteJsonPeer);
    } catch (err) {
      if (err.indexOf !== undefined && err.indexOf(CrawlerConstants.ERRORS.NEWER_PEER_DOCUMENT_AVAILABLE.uerr.message) !== -1 && err != CrawlerConstants.ERROR.PEER.UNKNOWN_REFERENCE_BLOCK) {
        throw err;
      }
    }
  }

  async syncSandbox(): Promise<void> {
    this.watcher.writeStatus('Synchronizing the sandboxes...');
    await pullSandboxToLocalServer(this.currency, this.node, this.server, this.server.logger, this.watcher, 1, false)
  }
}

class NodesMerkle {

  private depth:number
  private nodesCount:number
  private leavesCount:number
  private merkleRoot:string

  constructor(json:any) {
    this.depth = json.depth
    this.nodesCount = json.nodesCount
    this.leavesCount = json.leavesCount
    this.merkleRoot = json.root;
  }

  // var i = 0;
  // this.levels = [];
  // while(json && json.levels[i]){
  //   this.levels.push(json.levels[i]);
  //   i++;
  // }

  root() {
    return this.merkleRoot
  }
}
