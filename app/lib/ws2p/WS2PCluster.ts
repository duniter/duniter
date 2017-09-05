import {WS2PServer} from "./WS2PServer"
import {Server} from "../../../server"
import {WS2PClient} from "./WS2PClient"
import {WS2PConnection} from "./WS2PConnection"

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
    ws2pc.closed.then(() => {
      delete this.ws2pClients[uuid]
    })
    return ws2pc
  }
}