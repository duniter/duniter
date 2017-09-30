import {Server} from "../../../../server"
import {WS2PConnection, WS2PPubkeyLocalAuth, WS2PPubkeyRemoteAuth} from "./WS2PConnection"
import {WS2PStreamer} from "../../../lib/streams/WS2PStreamer"
import {Key} from "../../../lib/common-libs/crypto/keyring"
import {GlobalFifoPromise} from "../../../service/GlobalFifoPromise"
import * as events from "events"
import {WS2PConstants} from "./constants"
import {WS2PMessageHandler} from "./impl/WS2PMessageHandler"

const WebSocketServer = require('ws').Server

export class WS2PServer extends events.EventEmitter {

  private wss:any
  private connections:WS2PConnection[] = []
  private maxLevel2Size = WS2PConstants.MAX_LEVEL_2_PEERS

  private constructor(
    private server:Server,
    private host:string,
    private port:number,
    private fifo:GlobalFifoPromise,
    private shouldAcceptConnection:(pubkey:string, connectedPubkeys:string[])=>Promise<boolean>) {
    super()
    // Conf: max public connections
    if (this.server.conf.ws2p && this.server.conf.ws2p.maxPublic !== undefined) {
      this.maxLevel2Size = this.server.conf.ws2p.maxPublic
    }
  }

  get maxLevel2Peers() {
    return this.maxLevel2Size || 0
  }

  set maxLevel2Peers(newValue:number) {
    this.maxLevel2Size = Math.max(newValue, 0)
  }

  getConnexions() {
    return this.connections.slice()
  }

  private listenToWebSocketConnections(messageHandler:WS2PMessageHandler) {
    const key = new Key(this.server.conf.pair.pub, this.server.conf.pair.sec)
    this.wss = new WebSocketServer({ host: this.host, port: this.port })
    this.wss.on('connection', async (ws:any) => {

      this.server.logger.info('WS2P %s: new incoming connection from %s:%s!', this.server.conf.pair.pub, ws._sender._socket._handle.owner.remoteAddress, ws._sender._socket._handle.owner.remotePort)

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
        messageHandler,
        new WS2PPubkeyLocalAuth(this.server.conf.currency, key, acceptPubkey),
        new WS2PPubkeyRemoteAuth(this.server.conf.currency, key, acceptPubkey),
        {
          connectionTimeout: WS2PConstants.CONNEXION_TIMEOUT,
          requestTimeout: WS2PConstants.REQUEST_TIMEOUT
        }
      )

      try {
        await c.connect()
        const host = ws._sender._socket._handle.owner.remoteAddress
        const port = ws._sender._socket._handle.owner.remotePort
        this.server.push({
          ws2p: 'connected',
          to: { host, port, pubkey: c.pubkey }
        })
        this.connections.push(c)
        this.emit('newConnection', c)
        this.server.logger.info('WS2P: established incoming connection from %s:%s', host, port)

        // Broadcasting
        const ws2pStreamer = new WS2PStreamer(c)
        this.server.pipe(ws2pStreamer)

        ws.on('error', (e:any) => {
          this.server.logger.error(e)
        })

        ws.on('close', () => {
          this.server.unpipe(ws2pStreamer)
          this.removeConnection(c)
          this.server.push({
            ws2p: 'disconnected',
            peer: {
              pub: c.pubkey
            }
          })
        })

        await this.trimConnections()

        await this.server.dal.setPeerUP(c.pubkey)

      } catch (e) {
        this.server.logger.warn('WS2P: cannot connect to incoming WebSocket connection: %s', e)
      }
    })
  }

  async trimConnections() {
    /*** OVERFLOW TRIMMING ***/
    let disconnectedOne = true
    // Disconnect non-members
    while (disconnectedOne && this.connections.length > this.maxLevel2Size) {
      disconnectedOne = false
      for (const c of this.connections) {
        const isMember = await this.server.dal.isMember(c.pubkey)
        if (!isMember && !disconnectedOne) {
          c.close()
          this.removeConnection(c)
          disconnectedOne = true
        }
      }
    }
    // Disconnect members
    while (this.connections.length > this.maxLevel2Size) {
      for (const c of this.connections) {
        c.close()
        this.removeConnection(c)
      }
    }
    /*** DUPLICATES TRIMMING ***/
    disconnectedOne = true
    while (disconnectedOne) {
      disconnectedOne = false
      const pubkeysFound = []
      for (const c of this.connections) {
        if (pubkeysFound.indexOf(c.pubkey) !== -1) {
          c.close()
          this.removeConnection(c)
          disconnectedOne = true
        }
        else if (c.pubkey !== this.server.conf.pair.pub) {
          pubkeysFound.push(c.pubkey)
        }
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
    return new Promise((res, rej) => {
      this.wss.close((err:any) => {
        if (err) return rej(err)
        res()
      })
    })
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
        await new Promise(resolve => setTimeout(resolve, WS2PConstants.CONNEXION_TIMEOUT))
        throw Error("Pubkey not matching or too long to be obtained")
      }
    }))
  }

  static async bindOn(server:Server, host:string, port:number, fifo:GlobalFifoPromise, shouldAcceptConnection:(pubkey:string, connectedPubkeys:string[])=>Promise<boolean>, messageHandler:WS2PMessageHandler) {
    const ws2ps = new WS2PServer(server, host, port, fifo, shouldAcceptConnection)
    await ws2ps.listenToWebSocketConnections(messageHandler)
    server.logger.info('WS2P server %s listening on %s:%s', server.conf.pair.pub, host, port)
    return ws2ps
  }
}