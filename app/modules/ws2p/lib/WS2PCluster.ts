import {DEFAULT_ENCODING} from 'crypto';
import {WS2PServer} from "./WS2PServer"
import {Server} from "../../../../server"
import {WS2PClient} from "./WS2PClient"
import {WS2PConnection} from "./WS2PConnection"
import {randomPick} from "../../../lib/common-libs/randomPick"
import {CrawlerConstants} from "../../crawler/lib/constants"
import {WS2PBlockPuller} from "./WS2PBlockPuller"
import {WS2PDocpoolPuller} from "./WS2PDocpoolPuller"
import {WS2PConstants} from "./constants"
import {PeerDTO, WS2PEndpoint} from '../../../lib/dto/PeerDTO';
import {GlobalFifoPromise} from "../../../service/GlobalFifoPromise"
import {OtherConstants} from "../../../lib/other_constants"
import {Key, verify} from "../../../lib/common-libs/crypto/keyring"
import {WS2PServerMessageHandler} from "./interface/WS2PServerMessageHandler"
import {WS2PMessageHandler} from "./impl/WS2PMessageHandler"
import {CommonConstants} from '../../../lib/common-libs/constants';
import {Package} from "../../../lib/common/package";
import {ProverConstants} from "../../prover/lib/constants";
import {ProxiesConf} from '../../../lib/proxy';

const es = require('event-stream')
const nuuid = require('node-uuid')
const _ = require('underscore')

export interface WS2PHead {
  message:string
  sig:string
  messageV2?:string
  sigV2?:string
  step?:number
}

export interface WS2pHeadCache extends WS2PHead {
  blockstamp:string
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
  private ws2pClients:{[ws2puid:string]:WS2PClient} = {}
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

  // A cache of the current HEAD for a given ws2pFullId
  private headsCache:{ [ws2pFullId:string]:WS2pHeadCache } = {}

  // A buffer of "to be sent" heads
  private newHeads:WS2PHead[] = []

  // The triggerer of a buffer of heads' sending
  private headsTimeout:NodeJS.Timer|null = null

  // A timer to regularly reconnect to the network in case we are below the minimum connections' count
  private reconnectionInteval:NodeJS.Timer|null = null

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
    const myFullId = [localPub, ws2pId].join('-')
    if (!this.headsCache[myFullId]) {
      const current = await this.server.dal.getCurrentBlockOrNull()
      if (current) {
        const myHead = await this.sayHeadChangedTo(current.number, current.hash)
        const blockstamp = [current.number, current.hash].join('-')
        this.headsCache[myFullId] = { blockstamp, message: myHead.message, sig: myHead.sig, messageV2: myHead.messageV2, sigV2: myHead.sigV2, step:myHead.step  }

      }
    }
    for (const ws2pFullId of Object.keys(this.headsCache)) {
      heads.push({
        message: this.headsCache[ws2pFullId].message,
        sig: this.headsCache[ws2pFullId].sig,
        messageV2: this.headsCache[ws2pFullId].messageV2,
        sigV2: this.headsCache[ws2pFullId].sigV2,
        step: this.headsCache[ws2pFullId].step
      })
    }
    return heads
  }

  async headsReceived(heads:WS2PHead[]) {
    await Promise.all(heads.map(async (h:WS2PHead) => {
      try {
        // HEAD v2
        if (h.messageV2 && h.messageV2.match(WS2PConstants.HEAD_V2_REGEXP)) {
          if (!h.sigV2) {
            throw "HEAD_MESSAGE_WRONGLY_SIGNED"
          } else {
            const [,,, pub, blockstamp, ws2pId,,,,,]:string[] = h.messageV2.split(':')
            this.headReceived(h, pub, [pub, ws2pId].join('-'), blockstamp)
          }
        } 
        // HEAD v1 and HEAD v0
        else if (h.message && h.sig) {
          if (h.message.match(WS2PConstants.HEAD_V1_REGEXP)) {
            const [,,, pub, blockstamp, ws2pId,,,]:string[] = h.message.split(':')
            await this.headReceived(h, pub, [pub, ws2pId].join('-'), blockstamp)
          } else if (h.message.match(WS2PConstants.HEAD_V0_REGEXP)) {
            const [,,pub, blockstamp]:string[] = h.message.split(':')
            await this.headReceived(h, pub, [pub, "00000000"].join('-'), blockstamp)
          } else {
            throw "HEAD_WRONG_FORMAT"
          }
        }
        else if (!h.message) {
          throw "EMPTY_MESSAGE_FOR_HEAD"
        } else if (!h.sig) {
          throw "HEAD_MESSAGE_WRONGLY_SIGNED"
        } else {
          throw "HEAD_WRONG_FORMAT"
        }
      } catch (e) {
          this.server.logger.trace(e)
      }
    }))
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
    
    this.server.push({
      ws2p: 'heads',
      added: this.newHeads
    })
  }

  private async headReceived(h:WS2PHead, pub:string, fullId:string, blockstamp:string) {
    try {
      // Prevent fields injection
      if ( (h.message.match(WS2PConstants.HEAD_V1_REGEXP) || h.message.match(WS2PConstants.HEAD_V0_REGEXP))
      && h.sig.match(WS2PConstants.HEAD_SIG_REGEXP)
      && (!h.messageV2 || h.messageV2.match(WS2PConstants.HEAD_V2_REGEXP))
      && (!h.sigV2 || h.sigV2.match(WS2PConstants.HEAD_SIG_REGEXP))
      && (!h.step || h.step.toFixed(0).match(/^[0-9]*$/))
      ) {
        const head:WS2PHead = { message: h.message, sig: h.sig, messageV2: h.messageV2, sigV2: h.sigV2, step: h.step }

        const sigOK = verify(head.message, head.sig, pub)
        const sigV2OK = (head.messageV2 !== undefined && head.sigV2 !== undefined) ? verify(head.messageV2, head.sigV2, pub):false
        if ((sigV2OK && sigOK) || sigOK) {
          // Already known or more recent or closer ?
          const step = (this.headsCache[fullId]) ? this.headsCache[fullId].step || 0:0
          if (!this.headsCache[fullId] // unknow head
            || parseInt(this.headsCache[fullId].blockstamp) < parseInt(blockstamp) // more recent head
            || (head.step !== undefined && head.step < step && this.headsCache[fullId].blockstamp === blockstamp) // closer head
          ) {
            // Check that issuer is a member and that the block exists
            const isAllowed = pub === this.server.conf.pair.pub || this.isConnectedKey(pub) || (await this.isMemberKey(pub))
            if (isAllowed) {
              const exists = await this.existsBlock(blockstamp)
              if (exists) {
                this.headsCache[fullId] = { blockstamp, message: head.message, sig: head.sig, messageV2: head.messageV2, sigV2: head.sigV2, step: head.step }
                this.newHeads.push(head)
              }
            }
          }
        } else {
          throw "HEAD_MESSAGE_WRONGLY_SIGNED"
        }
      } else {
        throw "HEAD_WRONG_FORMAT"
      }
    } catch (e) {
      this.server.logger.trace(e)
    }
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
      return this.acceptPubkey(pubkey, connectedPubkeys, [], () => this.servedCount(), this.maxLevel2Peers, this.privilegedNodes(), (this.server.conf.ws2p !== undefined && this.server.conf.ws2p.privilegedOnly)) 
    }, this.keyPriorityLevel, this.messageHandler)
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
    let count = 0
    let connectedKeys:string[] = []
    for (const ws2pid in this.ws2pClients) {
      if (this.ws2pClients[ws2pid].connection.pubkey != this.server.conf.pair.pub
        && connectedKeys.indexOf(this.ws2pClients[ws2pid].connection.pubkey) == -1) {
        count++
        connectedKeys.push(this.ws2pClients[ws2pid].connection.pubkey)
      }
    }
    return count
  }

  numberOfConnectedPublicNodesWithSameKey() {
    let count = 0
    for (const ws2pid in this.ws2pClients) {
      if (this.ws2pClients[ws2pid].connection.pubkey === this.server.conf.pair.pub) {
        count++
      }
    }
    return count
  }

  servedCount() {
    return (this.ws2pServer) ? this.ws2pServer.countConnexions():0
  }

  privilegedNodes() {
    if (this.server.conf.ws2p && this.server.conf.ws2p.privilegedNodes) {
      return this.server.conf.ws2p.privilegedNodes
    } else {
      return  []
    }
  }

  async connectToRemoteWS(endpointVersion:number, host: string, port: number, path:string, messageHandler:WS2PMessageHandler, expectedPub:string, ws2pEndpointUUID:string = ""): Promise<WS2PConnection> {
    const uuid = nuuid.v4()
    let pub = expectedPub.slice(0, 8)
    const api:string = (host.match(WS2PConstants.HOST_ONION_REGEX) !== null) ? 'WS2PTOR':'WS2P'
    try {
      const fullEndpointAddress = WS2PCluster.getFullAddress(host, port, path)
      const ws2pc = await WS2PClient.connectTo(this.server, fullEndpointAddress, endpointVersion, ws2pEndpointUUID, messageHandler, expectedPub, (pub:string) => {
        const connectedPubkeys = this.getConnectedPubkeys()
        const connectedWS2PUID = this.getConnectedWS2PUID()
        const preferedNodes = (this.server.conf.ws2p && this.server.conf.ws2p.preferedNodes) ? this.server.conf.ws2p.preferedNodes:[]
        return this.acceptPubkey(expectedPub, connectedPubkeys, connectedWS2PUID, () => this.clientsCount(), this.maxLevel1Size, preferedNodes, (this.server.conf.ws2p && this.server.conf.ws2p.preferedOnly) || false, ws2pEndpointUUID)
      })
      this.ws2pClients[uuid] = ws2pc
      pub = ws2pc.connection.pubkey
      ws2pc.connection.closed.then(() => {
        this.server.logger.info(api+': connection [%s `'+api+' %s %s`] has been closed', pub.slice(0, 8), host, port)
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
      this.server.logger.info(api+': connected to peer %s using `'+api+' %s %s`!', pub.slice(0, 8), host, port)
      this.server.push({
        ws2p: 'connected',
        to: { host, port, pubkey: pub }
      })
      await this.server.dal.setPeerUP(pub)
      return ws2pc.connection
    } catch (e) {
      this.server.logger.info(api+': Could not connect to peer %s using `'+api+' %s %s: %s`', pub.slice(0, 8), host, port, (e && e.message || e))
      throw e
    }
  }

  async connectToWS2Peers() {
    // If incoming connections quota is full, delete one low-priority connection
    if (this.ws2pServer !== null && this.ws2pServer.countConnexions() === this.ws2pServer.maxLevel2Peers) {
      const privilegedKeys = ((this.server.conf.ws2p && this.server.conf.ws2p.privilegedNodes) || []).slice() // Copy
      this.ws2pServer.removeLowPriorityConnection(privilegedKeys)
    }
    const myUUID = (this.server.conf.ws2p && this.server.conf.ws2p.uuid) ? this.server.conf.ws2p.uuid:""
    const potentials = await this.server.dal.getWS2Peers()
    const peers:PeerDTO[] = potentials.map((p:any) => PeerDTO.fromJSONObject(p))
    const prefered = ((this.server.conf.ws2p && this.server.conf.ws2p.preferedNodes) || []).slice() // Copy
    // Our key is also a prefered one, so we connect to our siblings
    const canReachTorEndpoint = ProxiesConf.canReachTorEndpoint(this.server.conf.proxiesConf)
    const canReachClearEndpoint = ProxiesConf.canReachClearEndpoint(this.server.conf.proxiesConf)
    peers.sort((a, b) => {
      // Top priority at our own nodes
      if (a.pubkey === this.server.conf.pair.pub && b.pubkey !== this.server.conf.pair.pub) {
          return -1
      } else if (a.pubkey !== this.server.conf.pair.pub && b.pubkey === this.server.conf.pair.pub) {
        return 1
      }

      const aIsPrefered = prefered.indexOf(a.pubkey) !== -1
      const bIsPrefered = prefered.indexOf(b.pubkey) !== -1
      const aNumberOfFreeRooms = this.numberOfFreeRooms(a, canReachTorEndpoint, canReachClearEndpoint)
      const bNumberOfFreeRooms = this.numberOfFreeRooms(b, canReachTorEndpoint, canReachClearEndpoint)

      if (canReachTorEndpoint) {
        const aAtWs2pTorEnpoint = a.endpoints.filter(function (element) { return element.match(CommonConstants.WS2PTOR_REGEXP); }).length > 0
        const bAtWs2pTorEnpoint = b.endpoints.filter(function (element) { return element.match(CommonConstants.WS2PTOR_REGEXP); }).length > 0

        if ( (aAtWs2pTorEnpoint && bAtWs2pTorEnpoint) || (!aAtWs2pTorEnpoint && !bAtWs2pTorEnpoint) ) {
          if ((aIsPrefered && bIsPrefered) || (!aIsPrefered && !bIsPrefered))  {
            if (aNumberOfFreeRooms > bNumberOfFreeRooms) {
              return -1
            } else if (aNumberOfFreeRooms < bNumberOfFreeRooms) {
              return 1
            }
            return 0
          } else if (aIsPrefered) {
            return -1
          }
          return 1
        } else {
          if (aAtWs2pTorEnpoint) {
            return -1
          }
          return 1
        }
      } else {
        if ((aIsPrefered && bIsPrefered) || (!aIsPrefered && !bIsPrefered))  {
          if (aNumberOfFreeRooms > bNumberOfFreeRooms) {
            return -1
          } else if (aNumberOfFreeRooms < bNumberOfFreeRooms) {
            return 1
          }
          return 0
        } else if (aIsPrefered) {
          return -1
        }
        return 1
      }
    })
    let i = 0
    let countPublicNodesWithSameKey:number = 1 // Necessary if maxPrivate = 0
    let endpointsNodesWithSameKey:WS2PEndpoint[] = []
    while (i < peers.length && (this.clientsCount() < this.maxLevel1Size || this.numberOfConnectedPublicNodesWithSameKey() < countPublicNodesWithSameKey) ) {
      const p = peers[i]
      if (p.pubkey === this.server.conf.pair.pub) {
        endpointsNodesWithSameKey = p.getAllWS2PEndpoints(canReachTorEndpoint, canReachClearEndpoint, myUUID)
        countPublicNodesWithSameKey = endpointsNodesWithSameKey.length
        for (const api of endpointsNodesWithSameKey) {
          try {
            // We do not connect to local host
            if (api.uuid !== myUUID) {
              await this.connectToRemoteWS(api.version, api.host, api.port, api.path, this.messageHandler, p.pubkey, api.uuid)
            }
          } catch (e) {
            this.server.logger.debug('WS2P: init: failed connection')
          }
        }
      } else {
        const api = p.getOnceWS2PEndpoint(canReachTorEndpoint, canReachClearEndpoint)
        if (api) {
          try {
            // We do not connect to local host
            await this.connectToRemoteWS(api.version, api.host, api.port, api.path, this.messageHandler, p.pubkey, api.uuid)
          } catch (e) {
            this.server.logger.debug('WS2P: init: failed connection')
          }
        }
      }
      i++
      // Trim the eventual extra connections
      setTimeout(() => this.removeLowPriorityConnections(prefered), WS2PConstants.CONNEXION_TIMEOUT)
    }
  }

  private numberOfFreeRooms(p:PeerDTO, canReachTorEndpoint:boolean, canReachClearEndpoint:boolean) {
    const api = p.getOnceWS2PEndpoint(canReachTorEndpoint, canReachClearEndpoint)
    if (api) {
      for (const ws2pFullId in this.headsCache) {
        if (ws2pFullId.slice(0, 8) == api.uuid) {
          const messageV2 = this.headsCache[ws2pFullId].messageV2
          if (messageV2 !== undefined) {
            const [,,, pub, blockstamp, ws2pId,,,,freeMemberRoom,freeMirorRoom]:string[] = messageV2.split(':')
            return (this.server.dal.isMember(this.server.conf.pair.pub)) ? freeMemberRoom:freeMirorRoom
          }
        }
      }
    }
    return 0
  }

  listenServerFlow() {
    let connectingToNodesByFlow = false

    // Also listen for network updates, and connect to new nodes
    this.server.pipe(es.mapSync((data:any) => {

      (async () => {
        // New peer
        if (data.endpoints) {
          const peer = PeerDTO.fromJSONObject(data)
          const ws2pEnpoint = peer.getOnceWS2PEndpoint(ProxiesConf.canReachTorEndpoint(this.server.conf.proxiesConf), ProxiesConf.canReachClearEndpoint(this.server.conf.proxiesConf))
          if (ws2pEnpoint) {
            // Check if already connected to the pubkey (in any way: server or client)
            const connectedPubkeys = this.getConnectedPubkeys()
            const connectedWS2PUID = this.getConnectedWS2PUID()
            const preferedKeys = (this.server.conf.ws2p && this.server.conf.ws2p.preferedNodes) ? this.server.conf.ws2p.preferedNodes:[]
            const shouldAccept = await this.acceptPubkey(peer.pubkey, connectedPubkeys, connectedWS2PUID, () => this.clientsCount(), this.maxLevel1Size, preferedKeys, (this.server.conf.ws2p && this.server.conf.ws2p.preferedOnly) || false, ws2pEnpoint.uuid)
            if (shouldAccept && (!this.server.conf.ws2p || ws2pEnpoint.uuid !== this.server.conf.ws2p.uuid || peer.pubkey !== this.server.conf.pair.pub)) {
              await this.connectToRemoteWS(ws2pEnpoint.version, ws2pEnpoint.host, ws2pEnpoint.port, ws2pEnpoint.path, this.messageHandler, peer.pubkey, ws2pEnpoint.uuid)
              await this.removeLowPriorityConnections(preferedKeys)
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
          const myHead = await this.sayHeadChangedTo(data.block.number, data.block.hash)
          try {
            await this.broadcastHead(myHead)
          } catch (e) {
            this.server.logger.warn(e)
          }
        }
      })()

      return data
    }))
  }

  private async broadcastHead(head:WS2PHead) {
    await this.headsReceived([head])
    return this.spreadNewHeads([head])
  }

  private async spreadNewHeads(heads:WS2PHead[]) {
    heads = this.incrementHeadsStep(heads)
    const connexions = this.getAllConnections()
    return Promise.all(connexions.map(async (c) => {
      try {
          await c.pushHeads(heads)
      } catch (e) {
        this.server.logger.warn('Could not spread new HEAD info to %s WS2PID %s', c.pubkey, c.uuid)
      }
    }))
  }

  private incrementHeadsStep(heads_:WS2PHead[]) {
    let heads:WS2PHead[] = []
    for (let head of heads_) {
      if (head.step !== undefined) {
        head.step++
      }
      // Prevent injections
      heads.push({
        message: head.message,
        sig: head.sig,
        messageV2: head.messageV2,
        sigV2: head.sigV2,
        step: head.step
      })
    }
    return heads
  }

  private async sayHeadChangedTo(number:number, hash:string) {
    const api = this.getApi()
    const key = new Key(this.server.conf.pair.pub, this.server.conf.pair.sec)
    const software = 'duniter'
    const softVersion = Package.getInstance().version
    const ws2pId = (this.server.conf.ws2p && this.server.conf.ws2p.uuid) || '00000000'
    const prefix = this.server.conf.prefix || ProverConstants.DEFAULT_PEER_ID
    const { freeMemberRoom , freeMirorRoom }  = await this.countFreeRooms()
    const message = `${api}:HEAD:1:${key.publicKey}:${number}-${hash}:${ws2pId}:${software}:${softVersion}:${prefix}`
    const sig = key.signSync(message)
    const messageV2 = `${api}:HEAD:2:${key.publicKey}:${number}-${hash}:${ws2pId}:${software}:${softVersion}:${prefix}:${freeMemberRoom}:${freeMirorRoom}`
    const sigV2 = key.signSync(messageV2)
    
    const myHead:WS2PHead = {
      message,
      sig,
      messageV2,
      sigV2,
      step: 0 }

    return myHead
  }

  private getApi() {
    let api = 'WS2P'
    let network = {
      in: WS2PConstants.NETWORK.INCOMING.DEFAULT,
      out: WS2PConstants.NETWORK.OUTCOMING.DEFAULT,
    }
    let ws2pPrivate = ''
    let ws2pPublic = ''
    if (this.server.conf.proxiesConf && (this.server.conf.proxiesConf.proxyTorAddress || this.server.conf.proxiesConf.forceTor)) {
      network.out = WS2PConstants.NETWORK.OUTCOMING.TOR
    }
    if (this.server.conf.ws2p) {
      if (this.server.conf.ws2p.remotehost) {
        if (this.server.conf.ws2p.remotehost.match(WS2PConstants.HOST_ONION_REGEX)) {
          network.in = WS2PConstants.NETWORK.INCOMING.TOR
        }
        if (this.server.conf.ws2p.publicAccess) {
          ws2pPublic = 'I'
          switch (network.in) {
            case WS2PConstants.NETWORK.INCOMING.TOR: ws2pPublic += 'T'; break;
            default: ws2pPublic += 'C'; break;
          }
        }
      }
      if (this.server.conf.ws2p.privateAccess) {
        ws2pPrivate = 'O'
        switch (network.out) {
          case WS2PConstants.NETWORK.OUTCOMING.TOR: ws2pPrivate += 'T';
            if (this.server.conf.proxiesConf && this.server.conf.proxiesConf.reachingClearEp) {
              switch (this.server.conf.proxiesConf.reachingClearEp) {
                case 'none': ws2pPrivate += 'S'; break;
                case 'tor': ws2pPrivate += 'A'; break;
                default: ws2pPrivate += 'M'; break;
              }
            }
          break;
          default: ws2pPrivate += 'C'; break;
        }
      }
    }


    api += ws2pPrivate + ws2pPublic
    return api
  }

  private async countFreeRooms() {
    if (!this.ws2pServer) {
      return {
        freeMemberRoom: 0,
        freeMirorRoom: 0
      }
    }

    let freeMirorRoom = this.maxLevel2Peers - this.ws2pServer.countConnexions()
    let freeMemberRoom = freeMirorRoom
    const privilegedNodes = (this.server.conf.ws2p && this.server.conf.ws2p.privilegedNodes) ? this.server.conf.ws2p.privilegedNodes:[]
    for (const c of this.ws2pServer.getConnexions()) {
      const connexionPriority = await this.keyPriorityLevel(c.pubkey, privilegedNodes)
      if (connexionPriority < WS2PConstants.CONNECTIONS_PRIORITY.MEMBER_KEY_LEVEL) {
        freeMemberRoom++
      }
    }

    return {
      freeMemberRoom,
      freeMirorRoom
    }
  }

  async trimServerConnections() {
    if (this.ws2pServer) {
      await this.ws2pServer.removeExcessIncomingConnections()
    }
  }

  async removeLowPriorityConnections(preferedKeys:string[]) {
    let serverPubkeys:string[] = []
    if (this.ws2pServer) {
      serverPubkeys = this.ws2pServer.getConnexions().map(c => c.pubkey)
    }
    // Disconnect Private connexions already present under Public
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
        if (this.ws2pClients[uuid]) {
          delete this.ws2pClients[uuid]
        }
      }
    }
    // Disconnect Private connexions until the maximum size is respected
    while (this.clientsCount() > this.maxLevel1Size) {
      let uuids = Object.keys(this.ws2pClients)
      uuids = _.shuffle(uuids)
      let lowPriorityConnectionUUID:string = uuids[0]
      let minPriorityLevel = await this.keyPriorityLevel(this.ws2pClients[lowPriorityConnectionUUID].connection.pubkey, preferedKeys)
      for (const uuid of uuids) {
        const client = this.ws2pClients[uuid]
          if (uuid !== lowPriorityConnectionUUID) {
            let uuidPriorityLevel = await this.keyPriorityLevel(client.connection.pubkey, preferedKeys)
            if (uuidPriorityLevel < minPriorityLevel) {
              lowPriorityConnectionUUID = uuid
              minPriorityLevel = uuidPriorityLevel
            }
          }
      }
      this.ws2pClients[lowPriorityConnectionUUID].connection.close()
      await this.ws2pClients[lowPriorityConnectionUUID].connection.closed
      delete this.ws2pClients[lowPriorityConnectionUUID]
    }
  }

  async keyPriorityLevel(pubkey:string, preferedOrPrivilegedKeys:string[]) {
    const isMember = await this.server.dal.isMember(pubkey)
    let priorityLevel = (isMember) ? WS2PConstants.CONNECTIONS_PRIORITY.MEMBER_KEY_LEVEL:0
    priorityLevel += (preferedOrPrivilegedKeys.indexOf(pubkey) !== -1) ? WS2PConstants.CONNECTIONS_PRIORITY.PREFERED_PRIVILEGED_KEY_LEVEL:0
    priorityLevel += (this.server.conf.pair.pub === pubkey) ? WS2PConstants.CONNECTIONS_PRIORITY.SELF_KEY_LEVEL:0
    return priorityLevel
  }

  private getPreferedNodes(): string[] {
    return (this.server.conf.ws2p && this.server.conf.ws2p.preferedNodes) || []
  }

  protected async acceptPubkey(
    pub:string,
    connectedPubkeys:string[],
    connectedWS2PUID:string[],
    getConcurrentConnexionsCount:()=>number,
    maxConcurrentConnexionsSize:number,
    priorityKeys:string[],
    priorityKeysOnly:boolean,
    targetWS2PUID = ""
  ) {
    if (this.server.conf.pair.pub === pub) {
      // We do not accept oneself connetion
      if (this.server.conf.ws2p && this.server.conf.ws2p.uuid === targetWS2PUID || targetWS2PUID === '11111111') {
        return false
      } else {
        // We always accept self nodes, and they have a supreme priority (these are siblings)
        if (targetWS2PUID === "" ||  this.isNewSiblingNode(pub, targetWS2PUID, connectedWS2PUID) ) {
            return true
        } else {
          // We are already connected to this self node (same WS2PUID)
          return false
        }
      }
    }

    // We do not accept banned keys
    if (this.banned[pub]) {
      this.server.logger.warn('Connection to %s refused, reason: %s', pub.slice(0, 8), this.banned[pub])
      return false
    }

    // Is priority key ?
    let isPriorityKey = priorityKeys.indexOf(pub) !== -1

    // We do not accept forbidden keys
    if (priorityKeysOnly && !isPriorityKey && this.server.conf.pair.pub !== pub) {
      return false
    }

    // We do not accept keys already connected
    if (connectedPubkeys.indexOf(pub) !== -1) {
      return false
    }

    // Is member key ?
    const isMemberPeer = await this.server.dal.isMember(pub)

    // Do we have room?
    if (getConcurrentConnexionsCount() < maxConcurrentConnexionsSize) {
      // Yes: just connect to it
      return true
    }
    else {
      let minPriorityLevel = WS2PConstants.CONNECTIONS_PRIORITY.MAX_PRIORITY_LEVEL
      for (const connectedPubkey of connectedPubkeys) {
        const connectedPubkeyPriorityLevel = await this.keyPriorityLevel(connectedPubkey, priorityKeys)
        if (connectedPubkeyPriorityLevel < minPriorityLevel) {
          minPriorityLevel = connectedPubkeyPriorityLevel
        }
      }
      const pubkeyPriorityLevel = await this.keyPriorityLevel(pub, priorityKeys)
      if (pubkeyPriorityLevel > minPriorityLevel) {
        return true
      }
    }

    return false
  }

  isNewSiblingNode(pub:string, targetWS2PUID:string, connectedWS2PUID:string[]) {
    for (const uuid of connectedWS2PUID) {
      if (uuid === targetWS2PUID) {
        return false
      }
    }
    return true
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
    // For connectivity
    this.reconnectionInteval = setInterval(() => this.connectToWS2Peers(), 1000 * WS2PConstants.RECONNEXION_INTERVAL_IN_SEC)
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
    if (this.reconnectionInteval) {
      clearInterval(this.reconnectionInteval)
    }
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

  getConnectedWS2PUID() {
    const clients = Object.keys(this.ws2pClients).map(k => this.ws2pClients[k].connection.uuid)
    const served = this.ws2pServer ? this.ws2pServer.getConnexions().map(c => c.uuid) : []
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
