import {Server} from "../../../../server"
import {WS2PConnection, WS2PPubkeyLocalAuth, WS2PPubkeyRemoteAuth} from "./WS2PConnection"
import {WS2PServerMessageHandler} from "./interface/WS2PServerMessageHandler"
import {WS2PStreamer} from "../../../lib/streams/WS2PStreamer"
import {Key} from "../../../lib/common-libs/crypto/keyring"
import {GlobalFifoPromise} from "../../../service/GlobalFifoPromise"
import * as events from "events"
import {WS2PConstants} from "./constants"

const WebSocketServer = require('ws').Server

export class WS2PServer extends events.EventEmitter {

  private wss:any
  private connections:WS2PConnection[] = []

  private constructor(
    private server:Server,
    private host:string,
    private port:number,
    private fifo:GlobalFifoPromise,
    private shouldAcceptConnection:(pubkey:string, connectedPubkeys:string[])=>Promise<boolean>) {
    super()
  }

  getConnexions() {
    return this.connections.slice()
  }

  private listenToWebSocketConnections() {
    const key = new Key(this.server.conf.pair.pub, this.server.conf.pair.sec)
    this.wss = new WebSocketServer({ host: this.host, port: this.port })
    this.wss.on('connection', async (ws:any) => {

      this.server.logger.info('WS2P: new incoming connection from %s:%s!', ws._sender._socket._handle.owner.remoteAddress, ws._sender._socket._handle.owner.remotePort)

      await this.fifo.pushFIFOPromise('wss.connect:' + [ws._sender._socket._handle.owner.remoteAddress, ws._sender._socket._handle.owner.remotePort].join(':'), async () => {

        /******************
         * A NEW CONNECTION
         ******************/
        let saidPubkey:string = ""

        const acceptPubkey = async (pub:string) => {
          if (!saidPubkey) {
            saidPubkey = pub
          }
          if (saidPubkey !== pub) {
            // The key must be identical
            return false
          }
          return await this.shouldAcceptConnection(pub, this.getConnexions().map(c => c.pubkey))
        }

        const c = WS2PConnection.newConnectionFromWebSocketServer(
          ws,
          new WS2PServerMessageHandler(this.server),
          new WS2PPubkeyLocalAuth(key, acceptPubkey),
          new WS2PPubkeyRemoteAuth(key, acceptPubkey),
          {
            connectionTimeout: 5000,
            requestTimeout: 5000
          }
        )

        try {
          await c.connect()
          this.connections.push(c)
          this.emit('newConnection', c)
          this.server.logger.info('WS2P: established incoming connection from %s:%s', ws._sender._socket._handle.owner.remoteAddress, ws._sender._socket._handle.owner.remotePort)

          // Broadcasting
          const ws2pStreamer = new WS2PStreamer(c)
          this.server.pipe(ws2pStreamer)

          ws.on('error', (e:any) => {
            this.server.logger.error(e)
          })

          ws.on('close', () => {
            this.server.unpipe(ws2pStreamer)
            this.removeConnection(c)
          })

          await this.trimConnections()
        } catch (e) {
          this.server.logger.warn('WS2P: cannot connect to incoming WebSocket connection: %s', e)
        }
      })
    })
  }

  async trimConnections() {
    let disconnectedOne = true
    // Disconnect non-members
    while (disconnectedOne && this.connections.length > WS2PConstants.MAX_LEVEL_2_PEERS) {
      disconnectedOne = false
      for (const c of this.connections) {
        const isMember = await this.server.dal.isMember(c.pubkey)
        if (!isMember && !disconnectedOne) {
          c.close()
          disconnectedOne = true
        }
      }
    }
    // Disconnect members
    while (this.connections.length > WS2PConstants.MAX_LEVEL_2_PEERS) {
      for (const c of this.connections) {
        c.close()
      }
    }
  }

  private removeConnection(c:WS2PConnection) {
    const index = this.connections.indexOf(c)
    if (index !== -1) {
      // Remove the connection
      this.connections.splice(index, 1)
    }
  }

  async close() {
    await Promise.all(this.connections.map(c => c.close()))
    return this.wss.close()
  }

  async getConnection(pubkeyOfConnection:string) {
    if (this.connections.length === 0) {
      throw Error("No connections to look into.")
    }
    return Promise.race(this.connections.map(async (c) => {
      await c.connected
      if (c.pubkey === pubkeyOfConnection) {
        return c
      } else {
        await new Promise(resolve => setTimeout(resolve, 5000))
        throw Error("Pubkey not matching or too long to be obtained")
      }
    }))
  }

  static async bindOn(server:Server, host:string, port:number, fifo:GlobalFifoPromise, shouldAcceptConnection:(pubkey:string, connectedPubkeys:string[])=>Promise<boolean>) {
    const ws2ps = new WS2PServer(server, host, port, fifo, shouldAcceptConnection)
    await ws2ps.listenToWebSocketConnections()
    server.logger.info('WS2P server listening on %s:%s', host, port)
    return ws2ps
  }
}