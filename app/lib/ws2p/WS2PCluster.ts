import {WS2PServer} from "./WS2PServer"
import {Server} from "../../../server"
import {WS2PClient} from "./WS2PClient"
import {WS2PConnection} from "./WS2PConnection"
import {randomPick} from "../common-libs/randomPick"
import {CrawlerConstants} from "../../modules/crawler/lib/constants"
import {WS2PBlockPuller} from "./WS2PBlockPuller"
import {WS2PDocpoolPuller} from "./WS2PDocpoolPuller"

const nuuid = require('node-uuid')

export class WS2PCluster {

  private ws2pServer:WS2PServer|null = null
  private ws2pClients:{[k:string]:WS2PClient} = {}

  constructor(private server:Server) {}

  async listen(host:string, port:number) {
    if (this.ws2pServer) {
      await this.ws2pServer.close()
    }
    this.ws2pServer = await WS2PServer.bindOn(this.server, host, port)
    return this.ws2pServer
  }

  clientsCount() {
    return Object.keys(this.ws2pClients).length
  }

  async connect(host: string, port: number): Promise<WS2PConnection> {
    const uuid = nuuid.v4()
    const ws2pc = await WS2PClient.connectTo(this.server, host, port)
    this.ws2pClients[uuid] = ws2pc
    ws2pc.connection.closed.then(() => {
      delete this.ws2pClients[uuid]
    })
    return ws2pc.connection
  }

  async getAllConnections() {
    const all:WS2PConnection[] = this.ws2pServer ? this.ws2pServer.getConnexions() : []
    for (const uuid of Object.keys(this.ws2pClients)) {
      all.push(this.ws2pClients[uuid].connection)
    }
    return all
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
}