import {Server} from "../../../../server"
import {WS2PConnection, WS2PPubkeyLocalAuth, WS2PPubkeyRemoteAuth} from "./WS2PConnection"
import {WS2PServerMessageHandler} from "./interface/WS2PServerMessageHandler"
import {WS2PStreamer} from "../../../lib/streams/WS2PStreamer"
import {Key} from "../../../lib/common-libs/crypto/keyring"

const WebSocketServer = require('ws').Server

export class WS2PServer {

  private wss:any
  private connections:WS2PConnection[] = []

  private constructor(
    private server:Server,
    private host:string,
    private port:number) {
  }

  getConnexions() {
    return this.connections.slice()
  }

  private listenToWebSocketConnections() {
    const key = new Key(this.server.conf.pair.pub, this.server.conf.pair.sec)
    this.wss = new WebSocketServer({ host: this.host, port: this.port })
    this.wss.on('connection', async (ws:any) => {

      /******************
       * A NEW CONNECTION
       ******************/
      this.server.logger.info('WS2P: new incoming connection from %s:%s!', ws._sender._socket._handle.owner.remoteAddress, ws._sender._socket._handle.owner.remotePort)
      const c = WS2PConnection.newConnectionFromWebSocketServer(
        ws,
        new WS2PServerMessageHandler(this.server),
        new WS2PPubkeyLocalAuth(key),
        new WS2PPubkeyRemoteAuth(key), {
        connectionTimeout: 5000,
        requestTimeout: 5000
      })

      this.connections.push(c)

      c.connect()
        .then(() => this.server.logger.info('WS2P: established incoming connection from %s:%s', ws._sender._socket._handle.owner.remoteAddress, ws._sender._socket._handle.owner.remotePort))
        .catch((e:any) => console.error('WS2P: cannot connect to incoming WebSocket connection: %s', e))

      // Broadcasting
      const ws2pStreamer = new WS2PStreamer(c)
      this.server.pipe(ws2pStreamer)

      ws.on('error', (e:any) => {
        this.server.logger.error(e)
      })

      ws.on('close', () => {
        this.server.unpipe(ws2pStreamer)
      })
    })
  }

  async close() {
    await Promise.all(this.connections.map(c => c.close()))
    return this.wss.close()
  }

  async getConnection(pubkeyOfConnection:string) {
    if (this.connections.length === 0) {
      throw "No connections to look into."
    }
    return Promise.race(this.connections.map(async (c) => {
      await c.connected
      if (c.pubkey === pubkeyOfConnection) {
        return c
      } else {
        await new Promise(resolve => setTimeout(resolve, 5000))
        throw "Pubkey not matching or too long to be obtained"
      }
    }))
  }

  static async bindOn(server:Server, host:string, port:number) {
    const ws2ps = new WS2PServer(server, host, port)
    await ws2ps.listenToWebSocketConnections()
    server.logger.info('WS2P server listening on %s:%s', host, port)
    return ws2ps
  }
}