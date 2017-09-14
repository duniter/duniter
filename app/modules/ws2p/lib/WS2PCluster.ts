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

const es = require('event-stream')
const nuuid = require('node-uuid')
const _ = require('underscore')

export class WS2PCluster {

  private ws2pServer:WS2PServer|null = null
  private ws2pClients:{[k:string]:WS2PClient} = {}
  private host:string|null = null
  private port:number|null = null
  private syncBlockInterval:NodeJS.Timer
  private syncDocpoolInterval:NodeJS.Timer
  private fifo:GlobalFifoPromise = new GlobalFifoPromise()
  private maxLevel1Size = WS2PConstants.MAX_LEVEL_1_PEERS

  private constructor(private server:Server) {}

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
      return this.acceptPubkey(pubkey, connectedPubkeys, () => this.servedCount(), this.maxLevel2Peers, (this.server.conf.ws2p && this.server.conf.ws2p.alwaysAccept || []))
    })
    this.host = host
    this.port = port
    return this.ws2pServer
  }

  async close() {
    if (this.ws2pServer) {
      await this.ws2pServer.close()
    }
    const connections = await this.getAllConnections()
    await Promise.all(connections.map(c => c.close()))
  }

  clientsCount() {
    return Object.keys(this.ws2pClients).length
  }

  servedCount() {
    return this.ws2pServer ? this.ws2pServer.getConnexions().length : 0
  }

  async connect(host: string, port: number): Promise<WS2PConnection> {
    const uuid = nuuid.v4()
    const ws2pc = await WS2PClient.connectTo(this.server, host, port)
    this.ws2pClients[uuid] = ws2pc
    ws2pc.connection.closed.then(() => {
      this.server.logger.info('WS2P: connection [%s `WS2P %s %s`] has been closed', ws2pc.connection.pubkey.slice(0, 8), host, port)
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
    try {
      this.server.logger.info('WS2P: connected to peer %s using `WS2P %s %s`!', ws2pc.connection.pubkey.slice(0, 8), host, port)
      this.server.push({
        ws2p: 'connected',
        to: { host, port, pubkey: ws2pc.connection.pubkey }
      })
      return ws2pc.connection
    } catch (e) {
      this.server.logger.info('WS2P: Could not connect to peer %s using `WS2P %s %s: %s`', ws2pc.connection.pubkey.slice(0, 8), host, port, (e && e.message || e))
      throw e
    }
  }

  async connectToWS2Peers() {
    const potentials = await this.server.dal.getWS2Peers()
    const peers:PeerDTO[] = potentials.map((p:any) => PeerDTO.fromJSONObject(p))
    let i = 0
    while (i < peers.length && this.clientsCount() < this.maxLevel1Size) {
      const p = peers[i]
      const api = p.getWS2P()
      if (p.pubkey !== this.server.conf.pair.pub) {
        await this.connect(api.host, api.port)
      }
      i++
    }

    // Also listen for network updates, and connect to new nodes
    this.server.pipe(es.mapSync(async (data:any) => {
      if (data.endpoints) {
        const peer = PeerDTO.fromJSONObject(data)
        const ws2pEnpoint = peer.getWS2P()
        if (ws2pEnpoint && peer.pubkey !== this.server.conf.pair.pub) {
          // Check if already connected to the pubkey (in any way: server or client)
          const connectedPubkeys = this.getConnectedPubkeys()
          const shouldAccept = await this.acceptPubkey(peer.pubkey, connectedPubkeys, () => this.clientsCount(), this.maxLevel1Size, (this.server.conf.ws2p && this.server.conf.ws2p.preferedNodes || []))
          if (shouldAccept) {
            await this.connect(ws2pEnpoint.host, ws2pEnpoint.port)
            // Trim the eventual extra connections
            await this.trimClientConnections()
          }
        }
      }
    }))
  }

  async trimClientConnections() {
    let disconnectedOne = true
    // Disconnect non-members
    while (disconnectedOne && this.clientsCount() > this.maxLevel1Size) {
      disconnectedOne = false
      let uuids = Object.keys(this.ws2pClients)
      uuids = _.shuffle(uuids)
      for (const uuid of uuids) {
        const client = this.ws2pClients[uuid]
        const isMember = await this.server.dal.isMember(client.connection.pubkey)
        if (!isMember && !disconnectedOne) {
          client.connection.close()
          await client.connection.closed
          disconnectedOne = true
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
        if (!disconnectedOne && this.getPreferedNodes().indexOf(client.connection.pubkey) === -1) {
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
    priorityKeys:string[]
  ) {
    let accept = priorityKeys.indexOf(pub) !== -1
    if (!accept && connectedPubkeys.indexOf(pub) === -1) {
      // Do we have room?
      if (getConcurrentConnexionsCount() < maxConcurrentConnexionsSize) {
        // Yes: just connect to it
        accept = true
      }
      else {
        // No:
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
    return accept
  }

  async getAllConnections() {
    const all:WS2PConnection[] = this.ws2pServer ? this.ws2pServer.getConnexions() : []
    for (const uuid of Object.keys(this.ws2pClients)) {
      all.push(this.ws2pClients[uuid].connection)
    }
    return all
  }

  async startCrawling() {
    // For blocks
    if (this.syncBlockInterval)
      clearInterval(this.syncBlockInterval);
    this.syncBlockInterval = setInterval(() => this.pullBlocks(), 1000 * WS2PConstants.BLOCK_PULLING_INTERVAL)
    // Pull blocks right on start
    await this.connectToWS2Peers()
    await this.pullBlocks()
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
    const connections = await this.getAllConnections()
    const chosen = randomPick(connections, CrawlerConstants.CRAWL_PEERS_COUNT)

    await Promise.all(chosen.map(async (conn) => {
      const puller = new WS2PBlockPuller(this.server, conn)
      await puller.pull()
    }))

    await this.server.BlockchainService.pushFIFO("WS2PCrawlerResolution", async () => {
      await this.server.BlockchainService.blockResolution()
      await this.server.BlockchainService.forkResolution()
    })

    const current = await this.server.dal.getCurrentBlockOrNull()
    if (current) {
      this.server.pullingEvent('end', current.number)
    }
  }

  async pullDocpool() {
    const connections = await this.getAllConnections()
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
}