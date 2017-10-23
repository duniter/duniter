import {WS2PServer} from "./WS2PServer"
import {Server} from "../../../../server"
import {WS2PClient} from "./WS2PClient"
import {WS2PConnection} from "./WS2PConnection"
import {randomPick} from "../../../lib/common-libs/randomPick"
import {CrawlerConstants} from "../../crawler/lib/constants"
import {WS2PBlockPuller} from "./WS2PBlockPuller"
import {WS2PDocpoolPuller} from "./WS2PDocpoolPuller"
import {WS2PConstants} from "./constants"
import {PeerDTO} from "../../../lib/dto/PeerDTO"
import {GlobalFifoPromise} from "../../../service/GlobalFifoPromise"
import {OtherConstants} from "../../../lib/other_constants"
import {Key, verify} from "../../../lib/common-libs/crypto/keyring"
import {WS2PServerMessageHandler} from "./interface/WS2PServerMessageHandler"
import {WS2PMessageHandler} from "./impl/WS2PMessageHandler"
import { CommonConstants } from "../../../lib/common-libs/constants";
import { Package } from "../../../lib/common/package";
import { Constants } from "../../prover/lib/constants";

const es = require('event-stream')
const nuuid = require('node-uuid')
const _ = require('underscore')

export interface WS2PHead {
  message:string
  sig:string
}

export class WS2PCluster {

  static getFullAddress(host: string, port: number, path: string|null|undefined = null): string {
    if (host.match(CommonConstants.IPV6_REGEXP)) {
      host = "[" + host + "]"
    }
    // Make the path be a string
    path = path || ''
    // delete the space at the beginning of the path
    if (path.match(/^ /))
    {
      path = path.substr(1)
    }
    // Check that the path starts well with / (added if not)
    if (path.length > 0 && !path.match(/^\//))
    {
      path = '/'+path
    }
    // Choose the web protocol depending on the port
    const protocol = port == 443 ? "wss://": "ws://"
    return [protocol, host, ':', port, path].join('')
  }

  private ws2pServer:WS2PServer|null = null
  private ws2pClients:{[k:string]:WS2PClient} = {}
  private host:string|null = null
  private port:number|null = null
  private syncBlockInterval:NodeJS.Timer
  private syncDocpoolInterval:NodeJS.Timer
  private fifo:GlobalFifoPromise = new GlobalFifoPromise()
  private maxLevel1Size = WS2PConstants.MAX_LEVEL_1_PEERS
  private messageHandler: WS2PServerMessageHandler

  // A cache to remember the banned keys
  private banned:{ [k:string]: string } = {}

  // A cache to know if a block exists or not in the DB
  private blockstampsCache:{ [k:string]: number } = {}

  // A cache to know wether a pubkey is a member or not
  private memberkeysCache:{ [k:string]: number } = {}

  // A cache of the current HEAD for a given pubkey
  private headsCache:{ [ws2pFullId:string]: { blockstamp:string, message:string, sig:string } } = {}

  // A buffer of "to be sent" heads
  private newHeads:{ message:string, sig:string }[] = []

  // The triggerer of a buffer of heads' sending
  private headsTimeout:NodeJS.Timer|null = null

  private constructor(private server:Server) {
    this.messageHandler = new WS2PServerMessageHandler(this.server, this)
    // Conf: max private connections
    if (this.server.conf.ws2p && this.server.conf.ws2p.maxPrivate !== undefined) {
      this.maxLevel1Size = this.server.conf.ws2p.maxPrivate
    }
  }

  async getKnownHeads(): Promise<WS2PHead[]> {
    const heads:WS2PHead[] = []
    const ws2pId = (this.server.conf.ws2p && this.server.conf.ws2p.uuid) || '000000'
    const localPub = this.server.conf.pair.pub
    const fullId = [localPub, ws2pId].join('-')
    if (!this.headsCache[fullId]) {
      const current = await this.server.dal.getCurrentBlockOrNull()
      if (current) {
        const { sig, message } = this.sayHeadChangedTo(current.number, current.hash)
        const blockstamp = [current.number, current.hash].join('-')
        this.headsCache[fullId] = { blockstamp, message, sig }
      }
    }
    for (const ws2pFullId of Object.keys(this.headsCache)) {
      heads.push({
        message: this.headsCache[ws2pFullId].message,
        sig: this.headsCache[ws2pFullId].sig
      })
    }
    return heads
  }

  async headsReceived(heads:[{ message:string, sig:string }]) {
    const added:{ message:string, sig:string }[] = []
    await Promise.all(heads.map(async (h:{ message:string, sig:string }) => {
      try {
        const message = h.message
        const sig = h.sig
        if (!message) {
          throw "EMPTY_MESSAGE_FOR_HEAD"
        }
        if (message.match(WS2PConstants.HEAD_V0_REGEXP)) {
          const [,, pub, blockstamp]:string[] = message.split(':')
          const ws2pId = (this.server.conf.ws2p && this.server.conf.ws2p.uuid) || '000000'
          const fullId = [pub, ws2pId].join('-')
          const sigOK = verify(message, sig, pub)
          if (sigOK) {
            // Already known?
            if (!this.headsCache[fullId] || this.headsCache[fullId].blockstamp !== blockstamp) {
              // More recent?
              if (!this.headsCache[fullId] || parseInt(this.headsCache[fullId].blockstamp) < parseInt(blockstamp)) {
                // Check that issuer is a member and that the block exists
                const isAllowed = pub === this.server.conf.pair.pub || this.isConnectedKey(pub) || (await this.isMemberKey(pub))
                if (isAllowed) {
                  const exists = await this.existsBlock(blockstamp)
                  if (exists) {
                    this.headsCache[fullId] = { blockstamp, message, sig }
                    this.newHeads.push({message, sig})
                    added.push({message, sig})
                    // Cancel a pending "heads" to be spread
                    if (this.headsTimeout) {
                      clearTimeout(this.headsTimeout)
                    }
                    // Reprogram it a few moments later
                    this.headsTimeout = setTimeout(async () => {
                      const heads = this.newHeads.splice(0, this.newHeads.length)
                      if (heads.length) {
                        await this.spreadNewHeads(heads)
                      }
                    }, WS2PConstants.HEADS_SPREAD_TIMEOUT)
                  }
                }
              }
            }
          } else {
            throw "HEAD_MESSAGE_WRONGLY_SIGNED"
          }
        }
        else if (message.match(WS2PConstants.HEAD_V1_REGEXP)) {
          const [,,, pub, blockstamp, ws2pId, software, softVersion, prefix]:string[] = message.split(':')
          const sigOK = verify(message, sig, pub)
          const fullId = [pub, ws2pId].join('-')
          if (sigOK) {
            // Already known?
            if (!this.headsCache[fullId] || this.headsCache[fullId].blockstamp !== blockstamp) {
              // More recent?
              if (!this.headsCache[fullId] || parseInt(this.headsCache[fullId].blockstamp) < parseInt(blockstamp)) {
                // Check that issuer is a member and that the block exists
                const isAllowed = pub === this.server.conf.pair.pub || this.isConnectedKey(pub) || (await this.isMemberKey(pub))
                if (isAllowed) {
                  const exists = await this.existsBlock(blockstamp)
                  if (exists) {
                    this.headsCache[fullId] = { blockstamp, message, sig }
                    this.newHeads.push({message, sig})
                    added.push({message, sig})
                    // Cancel a pending "heads" to be spread
                    if (this.headsTimeout) {
                      clearTimeout(this.headsTimeout)
                    }
                    // Reprogram it a few moments later
                    this.headsTimeout = setTimeout(async () => {
                      const heads = this.newHeads.splice(0, this.newHeads.length)
                      if (heads.length) {
                        await this.spreadNewHeads(heads)
                      }
                    }, WS2PConstants.HEADS_SPREAD_TIMEOUT)
                  }
                }
              }
            }
          } else {
            throw "HEAD_MESSAGE_WRONGLY_SIGNED"
          }
        }
      } catch (e) {
        this.server.logger.trace(e)
      }
    }))
    this.server.push({
      ws2p: 'heads',
      added
    })
    return added
  }

  private async isMemberKey(pub:string) {
    let isMember = false
    if (this.memberkeysCache[pub]) {
      isMember = true
    }
    if (!isMember) {
      // Do we have this block in the DB?
      isMember = !!(await this.server.dal.isMember(pub))
    }
    if (isMember) {
      // Update the last time it was checked
      this.memberkeysCache[pub] = Date.now()
    }
    return isMember
  }

  private isConnectedKey(pub:string) {
    return this.getConnectedPubkeys().indexOf(pub) !== -1
  }

  private async existsBlock(blockstamp:string) {
    let exists = false
    if (this.blockstampsCache[blockstamp]) {
      exists = true
    }
    if (!exists) {
      // Do we have this block in the DB?
      exists = !!(await this.server.dal.getAbsoluteBlockByBlockstamp(blockstamp))
    }
    // Update the last time it was checked
    this.blockstampsCache[blockstamp] = Date.now()
    return exists
  }

  static plugOn(server:Server) {
    const cluster = new WS2PCluster(server)
    server.ws2pCluster = cluster
    return cluster
  }

  set maxLevel1Peers(newValue:number) {
    this.maxLevel1Size = Math.max(newValue, 0) || 0
  }

  set maxLevel2Peers(newValue:number) {
    if (this.ws2pServer) {
      this.ws2pServer.maxLevel2Peers = Math.max(newValue, 0)
    }
  }

  get maxLevel2Peers() {
    if (this.ws2pServer) {
      return this.ws2pServer.maxLevel2Peers || 0
    }
    return 0
  }

  async listen(host:string, port:number) {
    if (this.ws2pServer) {
      await this.ws2pServer.close()
    }
    this.ws2pServer = await WS2PServer.bindOn(this.server, host, port, this.fifo, (pubkey:string, connectedPubkeys:string[]) => {
      return this.acceptPubkey(pubkey, connectedPubkeys, () => this.servedCount(), this.maxLevel2Peers, (this.server.conf.ws2p && this.server.conf.ws2p.privilegedNodes || []))
    }, this.messageHandler)
    this.host = host
    this.port = port
    return this.ws2pServer
  }

  async close() {
    if (this.ws2pServer) {
      await this.ws2pServer.close()
    }
    const connections = this.getAllConnections()
    await Promise.all(connections.map(c => c.close()))
  }

  clientsCount() {
    return Object.keys(this.ws2pClients).length
  }

  servedCount() {
    return this.ws2pServer ? this.ws2pServer.getConnexions().length : 0
  }

  async connectToRemoteWS(host: string, port: number, path:string, messageHandler:WS2PMessageHandler, expectedPub:string, ws2pEndpointUUID:string = ""): Promise<WS2PConnection> {
    const uuid = nuuid.v4()
    let pub = "--------"
    try {
      const fullEndpointAddress = WS2PCluster.getFullAddress(host, port, path)
      const ws2pc = await WS2PClient.connectTo(this.server, fullEndpointAddress, messageHandler, expectedPub, (pub:string) => {
        const connectedPubkeys = this.getConnectedPubkeys()
        return this.acceptPubkey(expectedPub, connectedPubkeys, () => this.clientsCount(), this.maxLevel1Size, (this.server.conf.ws2p && this.server.conf.ws2p.preferedNodes || []), ws2pEndpointUUID)
      })
      this.ws2pClients[uuid] = ws2pc
      pub = ws2pc.connection.pubkey
      ws2pc.connection.closed.then(() => {
        this.server.logger.info('WS2P: connection [%s `WS2P %s %s`] has been closed', pub.slice(0, 8), host, port)
        this.server.push({
          ws2p: 'disconnected',
          peer: {
            pub: ws2pc.connection.pubkey
          }
        })
        if (this.ws2pClients[uuid]) {
          delete this.ws2pClients[uuid]
        }
      })
      this.server.logger.info('WS2P: connected to peer %s using `WS2P %s %s`!', pub.slice(0, 8), host, port)
      this.server.push({
        ws2p: 'connected',
        to: { host, port, pubkey: pub }
      })
      await this.server.dal.setPeerUP(pub)
      return ws2pc.connection
    } catch (e) {
      this.server.logger.info('WS2P: Could not connect to peer %s using `WS2P %s %s: %s`', pub.slice(0, 8), host, port, (e && e.message || e))
      throw e
    }
  }

  async connectToWS2Peers() {
    const potentials = await this.server.dal.getWS2Peers()
    const peers:PeerDTO[] = potentials.map((p:any) => PeerDTO.fromJSONObject(p))
    const prefered = ((this.server.conf.ws2p && this.server.conf.ws2p.preferedNodes) || []).slice() // Copy
    // Our key is also a prefered one, so we connect to our siblings
    prefered.push(this.server.conf.pair.pub)
    peers.sort((a, b) => {
      const aIsPrefered = prefered.indexOf(a.pubkey) !== -1
      const bIsPrefered = prefered.indexOf(b.pubkey) !== -1
      if ((aIsPrefered && bIsPrefered) || (!aIsPrefered && !bIsPrefered)) {
        return 0
      } else if (aIsPrefered) {
        return -1
      } else {
        return 1
      }
    })
    let i = 0
    while (i < peers.length && this.clientsCount() < this.maxLevel1Size) {
      const p = peers[i]
      const api = p.getWS2P()
      if (api) {
        try {
          await this.connectToRemoteWS(api.host, api.port, api.path, this.messageHandler, p.pubkey, api.uuid)
        } catch (e) {
          this.server.logger.debug('WS2P: init: failed connection')
        }
      }
      i++
      // Trim the eventual extra connections
      setTimeout(() => this.trimClientConnections(), WS2PConstants.CONNEXION_TIMEOUT)
    }
  }

  listenServerFlow() {
    let connectingToNodesByFlow = false

    // Also listen for network updates, and connect to new nodes
    this.server.pipe(es.mapSync((data:any) => {

      (async () => {
        // New peer
        if (data.endpoints) {
          const peer = PeerDTO.fromJSONObject(data)
          const ws2pEnpoint = peer.getWS2P()
          if (ws2pEnpoint) {
            // Check if already connected to the pubkey (in any way: server or client)
            const connectedPubkeys = this.getConnectedPubkeys()
            const shouldAccept = await this.acceptPubkey(peer.pubkey, connectedPubkeys, () => this.clientsCount(), this.maxLevel1Size, (this.server.conf.ws2p && this.server.conf.ws2p.preferedNodes || []), ws2pEnpoint.uuid)
            if (shouldAccept) {
              await this.connectToRemoteWS(ws2pEnpoint.host, ws2pEnpoint.port, ws2pEnpoint.path, this.messageHandler, peer.pubkey)
              await this.trimClientConnections()
            }
          }
        }

        // Block received
        else if (data.joiners) {
          // Update the cache
          this.blockstampsCache[[data.number, data.hash].join('-')] = Date.now()
        }

        // HEAD changed
        else if (data.bcEvent === OtherConstants.BC_EVENT.HEAD_CHANGED || data.bcEvent === OtherConstants.BC_EVENT.SWITCHED) {
          // Propagate this change to the network
          const { sig, message } = this.sayHeadChangedTo(data.block.number, data.block.hash)
          try {
            await this.broadcastHead(message, sig)
          } catch (e) {
            this.server.logger.warn(e)
          }
        }

        // WS2P disconnection
        else if (data.ws2p === 'disconnected') {
          const nbConnections = this.getAllConnections().length
          if (nbConnections < WS2PConstants.CONNECTIONS_LOW_LEVEL && !connectingToNodesByFlow) {
            try {
              connectingToNodesByFlow = true
              await this.connectToWS2Peers()
            } catch (e) {
              throw e
            } finally {
              connectingToNodesByFlow = false
            }
          }
        }
      })()

      return data
    }))
  }

  private async broadcastHead(message:string, sig:string) {
    await this.headsReceived([{ message, sig }])
    return this.spreadNewHeads([{ message, sig }])
  }

  private async spreadNewHeads(heads:{ message:string, sig:string }[]) {
    const connexions = this.getAllConnections()
    return Promise.all(connexions.map(async (c) => {
      try {
        await c.pushHeads(heads)
      } catch (e) {
        this.server.logger.warn('Could not spread new HEAD info to %s WS2P %s %s', c.pubkey)
      }
    }))
  }

  private sayHeadChangedTo(number:number, hash:string) {
    const key = new Key(this.server.conf.pair.pub, this.server.conf.pair.sec)
    const pub = key.publicKey
    const software = 'duniter'
    const softVersion = Package.getInstance().version
    const ws2pId = (this.server.conf.ws2p && this.server.conf.ws2p.uuid) || '00000000'
    const prefix = this.server.conf.prefix || Constants.DEFAULT_PEER_ID
    const message = `WS2P:HEAD:1:${pub}:${number}-${hash}:${ws2pId}:${software}:${softVersion}:${prefix}`
    const sig = key.signSync(message)
    return { sig, message, pub }
  }

  async trimClientConnections() {
    let serverPubkeys:string[] = []
    if (this.ws2pServer) {
      serverPubkeys = this.ws2pServer.getConnexions().map(c => c.pubkey)
    }
    let disconnectedOne = true
    // Disconnect Private connexions already present under Public
    while (disconnectedOne) {
      disconnectedOne = false
      let uuids = Object.keys(this.ws2pClients)
      uuids = _.shuffle(uuids)
      for (const uuid of uuids) {
        const client = this.ws2pClients[uuid]
        const pub = client.connection.pubkey
        const isNotOurself = pub !== this.server.conf.pair.pub
        const isAlreadyInPublic = serverPubkeys.indexOf(pub) !== -1
        if (isNotOurself && isAlreadyInPublic) {
          client.connection.close()
          await client.connection.closed
          disconnectedOne = true
          if (this.ws2pClients[uuid]) {
            delete this.ws2pClients[uuid]
          }
        }
      }
    }
    // Disconnect non-members
    while (disconnectedOne && this.clientsCount() > this.maxLevel1Size) {
      disconnectedOne = false
      let uuids = Object.keys(this.ws2pClients)
      uuids = _.shuffle(uuids)
      for (const uuid of uuids) {
        const client = this.ws2pClients[uuid]
        const pub = client.connection.pubkey
        const isNotOurself = pub !== this.server.conf.pair.pub
        const isMember = await this.server.dal.isMember(pub)
        if (isNotOurself && !isMember && !disconnectedOne) {
          client.connection.close()
          await client.connection.closed
          disconnectedOne = true
          if (this.ws2pClients[uuid]) {
            delete this.ws2pClients[uuid]
          }
        }
      }
    }
    disconnectedOne = true
    // Disconnect non-prefered members
    while (disconnectedOne && this.clientsCount() > this.maxLevel1Size) {
      disconnectedOne = false
      let uuids = Object.keys(this.ws2pClients)
      uuids = _.shuffle(uuids)
      for (const uuid of uuids) {
        const client = this.ws2pClients[uuid]
        const pub = client.connection.pubkey
        const isNotOurself = pub !== this.server.conf.pair.pub
        if (isNotOurself && !disconnectedOne && this.getPreferedNodes().indexOf(pub) === -1) {
          client.connection.close()
          disconnectedOne = true
          await client.connection.closed
          if (this.ws2pClients[uuid]) {
            delete this.ws2pClients[uuid]
          }
        }
      }
    }
    // Disconnect anything
    disconnectedOne = true
    while (disconnectedOne && this.clientsCount() > this.maxLevel1Size) {
      disconnectedOne = false
      let uuids = Object.keys(this.ws2pClients)
      uuids = _.shuffle(uuids)
      for (const uuid of uuids) {
        const client = this.ws2pClients[uuid]
        if (!disconnectedOne) {
          client.connection.close()
          disconnectedOne = true
          await client.connection.closed
          if (this.ws2pClients[uuid]) {
            delete this.ws2pClients[uuid]
          }
        }
      }
    }
  }

  private getPreferedNodes(): string[] {
    return (this.server.conf.ws2p && this.server.conf.ws2p.preferedNodes) || []
  }

  protected async acceptPubkey(
    pub:string,
    connectedPubkeys:string[],
    getConcurrentConnexionsCount:()=>number,
    maxConcurrentConnexionsSize:number,
    priorityKeys:string[],
    targetWS2PUID = ""
  ) {
    // We do not accept banned keys
    if (this.banned[pub]) {
      this.server.logger.warn('Connection to %s refused, reason: %s', pub.slice(0, 8), this.banned[pub])
      return false
    }
    let accept = priorityKeys.indexOf(pub) !== -1
    if (!accept && connectedPubkeys.indexOf(pub) === -1) {
      // Do we have room?
      if (this.isThisNode(pub, targetWS2PUID)) {
        // We do not connect to local host
        return false
      }
      else if (getConcurrentConnexionsCount() < maxConcurrentConnexionsSize) {
        // Yes: just connect to it
        accept = true
      }
      else {
        // No: let's verify some peer has a lower priority
        if (connectedPubkeys.indexOf(this.server.conf.pair.pub) !== -1) {
          // Yes, we are connected to ourself. Let's replace this connexion
          accept = true
        }
        else {
          // Does this node have the priority over at least one node?
          const isMemberPeer = await this.server.dal.isMember(pub)
          if (isMemberPeer) {
            // The node may have the priority over at least 1 other node
            let i = 0, existsOneNonMemberNode = false
            while (!existsOneNonMemberNode && i < connectedPubkeys.length) {
              const isAlsoAMemberPeer = await this.server.dal.isMember(connectedPubkeys[i])
              existsOneNonMemberNode = !isAlsoAMemberPeer
              i++
            }
            if (existsOneNonMemberNode) {
              // The node has the priority over a non-member peer: try to connect
              accept = true
            }
          }
        }
      }
    } else {
      // The pubkey is already connected: we accept only self nodes, and they have a supreme priority (these are siblings)
      if (targetWS2PUID) {
        if (this.isSiblingNode(pub, targetWS2PUID)) {
          accept = true
        }
      }
    }
    return accept
  }

  isThisNode(pub:string, uuid:string) {
    return !!(this.server.conf.pair.pub === pub && this.server.conf.ws2p && this.server.conf.ws2p.uuid === uuid)
  }

  isSiblingNode(pub:string, uuid:string) {
    return !!(this.server.conf.pair.pub === pub && this.server.conf.ws2p && this.server.conf.ws2p.uuid !== uuid)
  }

  async getLevel1Connections() {
    const all:WS2PConnection[] = []
    for (const uuid of Object.keys(this.ws2pClients)) {
      all.push(this.ws2pClients[uuid].connection)
    }
    return all
  }

  async getLevel2Connections(): Promise<WS2PConnection[]> {
    return this.ws2pServer ? this.ws2pServer.getConnexions() : []
  }

  getAllConnections() {
    const all:WS2PConnection[] = this.ws2pServer ? this.ws2pServer.getConnexions() : []
    for (const uuid of Object.keys(this.ws2pClients)) {
      all.push(this.ws2pClients[uuid].connection)
    }
    return all
  }

  async startCrawling(waitConnection = false) {
    // For blocks
    if (this.syncBlockInterval)
      clearInterval(this.syncBlockInterval);
    this.syncBlockInterval = setInterval(() => this.pullBlocks(), 1000 * WS2PConstants.BLOCK_PULLING_INTERVAL);
    // Pull blocks right on start
    const init = async () => {
      try {
        await this.listenServerFlow()
        await this.connectToWS2Peers()
        await this.pullBlocks()
      } catch (e) {
        this.server.logger.error(e)
      }
    }
    if (waitConnection) {
      await init()
    } else {
      init()
    }
    // For docpool
    if (this.syncDocpoolInterval)
      clearInterval(this.syncDocpoolInterval);
    this.syncDocpoolInterval = setInterval(() => this.pullDocpool(), 1000 * WS2PConstants.DOCPOOL_PULLING_INTERVAL)
    // The first pulling occurs 10 minutes after the start
    setTimeout(() => this.pullDocpool(), WS2PConstants.SANDBOX_FIRST_PULL_DELAY)
  }

  async stopCrawling() {
    if (this.syncBlockInterval) {
      clearInterval(this.syncBlockInterval)
    }
    if (this.syncDocpoolInterval) {
      clearInterval(this.syncDocpoolInterval)
    }
  }

  async pullBlocks() {
    let current:{number:number} = { number: -1 }
    let newCurrent:{number:number} = { number: 0 }
    while (current && newCurrent && newCurrent.number > current.number) {
      current = newCurrent
      await this.makeApullShot()
      newCurrent = await this.server.dal.getCurrentBlockOrNull()
    }
    if (current) {
      this.server.pullingEvent('end', current.number)
    }
  }

  private async makeApullShot() {
    const connections = this.getAllConnections()
    const chosen = randomPick(connections, CrawlerConstants.CRAWL_PEERS_COUNT)

    await Promise.all(chosen.map(async (conn) => {
      try {
        const puller = new WS2PBlockPuller(this.server, conn)
        await puller.pull()
      } catch (e) {
        this.server.logger.warn(e)
      }
    }))

    await this.server.BlockchainService.pushFIFO("WS2PCrawlerResolution", async () => {
      await this.server.BlockchainService.blockResolution()
      await this.server.BlockchainService.forkResolution()
    })
  }

  async pullDocpool() {
    const connections = this.getAllConnections()
    const chosen = randomPick(connections, CrawlerConstants.CRAWL_PEERS_COUNT)
    await Promise.all(chosen.map(async (conn) => {
      const puller = new WS2PDocpoolPuller(this.server, conn)
      await puller.pull()
    }))
  }

  getConnectedPubkeys() {
    const clients = Object.keys(this.ws2pClients).map(k => this.ws2pClients[k].connection.pubkey)
    const served = this.ws2pServer ? this.ws2pServer.getConnexions().map(c => c.pubkey) : []
    return clients.concat(served)
  }

  banConnection(c:WS2PConnection, reason:string) {
    this.server.logger.warn('Banning connections of %s for %ss, reason: %s', c.pubkey.slice(0, 8), WS2PConstants.BAN_DURATION_IN_SECONDS, reason)
    if (c.pubkey) {
      this.banned[c.pubkey] = reason
      setTimeout(() => {
        delete this.banned[c.pubkey]
      }, 1000 * WS2PConstants.BAN_DURATION_IN_SECONDS)
      const connections = this.getAllConnections()
      for (const connection of connections) {
        if (c.pubkey == connection.pubkey) {
          connection.close()
        }
      }
    }
  }
}