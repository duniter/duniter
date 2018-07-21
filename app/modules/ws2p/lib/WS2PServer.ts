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

import {Server} from "../../../../server"
import {WS2PConnection, WS2PPubkeyLocalAuth, WS2PPubkeyRemoteAuth} from "./WS2PConnection"
import {Key} from "../../../lib/common-libs/crypto/keyring"
import {GlobalFifoPromise} from "../../../service/GlobalFifoPromise"
import * as events from "events"
import {WS2PConstants} from "./constants"
import {WS2PMessageHandler} from "./impl/WS2PMessageHandler"
import {WS2PStreamer} from "./WS2PStreamer"
import {WS2PSingleWriteStream} from "./WS2PSingleWriteStream"
import {WebSocketServer} from "../../../lib/common-libs/websocket"

export class WS2PServer extends events.EventEmitter {

  private wss:any
  private connections:WS2PConnection[] = []
  private synConnections:WS2PConnection[] = []

  private constructor(
    private server:Server,
    private host:string,
    private port:number,
    private fifo:GlobalFifoPromise,
    private shouldAcceptConnection:(pubkey:string, isSync: boolean, syncConnectedPubkeys:string[], connectedPubkeys:string[])=>Promise<boolean>,
    public keyPriorityLevel:(pubkey:string, privilegedKeys:string[])=>Promise<number>) {
    super()
  }

  get maxLevel2Peers() {
    if (this.server.conf.ws2p && this.server.conf.ws2p.maxPublic !== undefined && this.server.conf.ws2p.maxPublic !== null) {
      return this.server.conf.ws2p.maxPublic
    }
    return WS2PConstants.MAX_LEVEL_2_PEERS
  }

  getConnexions() {
    return this.connections.slice()
  }

  getConnexionsForSync() {
    return this.synConnections.slice()
  }

  countConnexions() {
    const connections = this.getConnexions()
    let count = 0
    for (const c of connections) {
      if (c.pubkey != this.server.conf.pair.pub) {
        count++
      }
    }
    return count
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

      const acceptPubkey = async (pub:string, isSync: boolean) => {
        if (!saidPubkey) {
          saidPubkey = pub
        }
        if (saidPubkey !== pub) {
          // The key must be identical
          return false
        }
        return await this.shouldAcceptConnection(pub, isSync, this.getConnexionsForSync().map(c => c.pubkey), this.getConnexions().map(c => c.pubkey))
      }
      let timeout = {
        connectionTimeout: WS2PConstants.CONNEXION_TIMEOUT,
        requestTimeout: WS2PConstants.REQUEST_TIMEOUT
      }
      if (this.server.conf.ws2p && this.server.conf.ws2p.remotehost && this.server.conf.ws2p.remotehost.match(WS2PConstants.HOST_ONION_REGEX)) {
        timeout = {
          connectionTimeout: WS2PConstants.CONNEXION_TOR_TIMEOUT,
          requestTimeout: WS2PConstants.REQUEST_TOR_TIMEOUT
        }
      }
      const myWs2pId = (this.server.conf.ws2p && this.server.conf.ws2p.uuid) ? this.server.conf.ws2p.uuid:""
      const c = WS2PConnection.newConnectionFromWebSocketServer(
        ws,
        messageHandler,
        new WS2PPubkeyLocalAuth(this.server.conf.currency, key, myWs2pId, pub => acceptPubkey(pub, false)),
        new WS2PPubkeyRemoteAuth(this.server.conf.currency, key, acceptPubkey),
        timeout
      )

      try {
        await c.connect()

        /**
         * Sync is a particular case:
         *   - we remember the connection
         *   - we allow it to run for a limited period of time
         *   - we don't broadcast any data to it
         *   - we only allow blocks+peering fetching, any other request is forbidden and closes the connection
         */
        if (c.isSync) {
          // We remember it
          this.synConnections.push(c)
          // When the connection closes:
          ws.on('close', () => {
            // Remove the connection
            const index = this.synConnections.indexOf(c)
            if (index !== -1) {
              // Remove the connection
              this.synConnections.splice(index, 1)
              c.close()
            }
          })
          // We close the connection after a given delay
          setTimeout(() => c.close(), 1000 * WS2PConstants.SYNC_CONNECTION_DURATION_IN_SECONDS)
          // We don't broadcast or pipe data
          return
        }

        const host = ws._sender._socket._handle.owner.remoteAddress
        const port = ws._sender._socket._handle.owner.remotePort
        this.server.push({
          ws2p: 'connected',
          to: { host, port, pubkey: c.pubkey }
        })
        this.connections.push(c)
        this.emit('newConnection', c)
        this.server.logger.info('WS2P: established incoming connection from %s %s:%s', c.pubkey.slice(0, 8), host, port)

        // Broadcasting
        const singleWriteProtection = new WS2PSingleWriteStream()
        const ws2pStreamer = new WS2PStreamer(c)
        this.server
          .pipe(singleWriteProtection)
          .pipe(ws2pStreamer)

        ws.on('error', (e:any) => {
          this.server.logger.error(e)
        })

        ws.on('close', () => {
          this.server.unpipe(singleWriteProtection)
          singleWriteProtection.unpipe(ws2pStreamer)
          this.server.logger.info('WS2P: close incoming connection from %s %s:%s', c.pubkey.slice(0, 8), host, port)
          this.removeConnection(c)
          this.server.push({
            ws2p: 'disconnected',
            peer: {
              pub: c.pubkey
            }
          })
        })

        // Remove excess incoming connections
        this.removeExcessIncomingConnections()

        await this.server.dal.setPeerUP(c.pubkey)

      } catch (e) {
        ws.close()
        this.server.logger.warn('WS2P: cannot connect to incoming WebSocket connection: %s', e)
      }
    })
  }

  async removeExcessIncomingConnections() {
    await this.removeDuplicateConnections()
    const ws2pPublicMax = (this.server.conf.ws2p && this.server.conf.ws2p.maxPublic) ? this.server.conf.ws2p.maxPublic:WS2PConstants.MAX_LEVEL_2_PEERS
    let privilegedKeys = (this.server.conf.ws2p && this.server.conf.ws2p.privilegedNodes) ? this.server.conf.ws2p.privilegedNodes:[]
    while (this.countConnexions() > this.maxLevel2Peers) {
      await this.removeLowPriorityConnection(privilegedKeys)
    }
  }

  async removeDuplicateConnections() {
    let connectedPubkeys:string[] = []
    for (const c of this.connections) {
      if (connectedPubkeys.indexOf(c.pubkey) !== -1) {
        this.removeConnection(c)
      } else if (c.pubkey !== this.server.conf.pair.pub) {
        connectedPubkeys.push(c.pubkey)
      }
    }
  }

  async removeLowPriorityConnection(privilegedKeys:string[]) {
    let lowPriorityConnection:WS2PConnection = this.connections[0]
    let minPriorityLevel = await this.keyPriorityLevel(lowPriorityConnection.pubkey, privilegedKeys)
    for (const c of this.connections) {
      if (c !== lowPriorityConnection) {
        let cPriorityLevel = await this.keyPriorityLevel(c.pubkey, privilegedKeys)
        if (cPriorityLevel < minPriorityLevel) {
          lowPriorityConnection = c
          minPriorityLevel = cPriorityLevel
        }
      }
    }
    this.removeConnection(lowPriorityConnection)
  }

  private removeConnection(c:WS2PConnection) {
    const index = this.connections.indexOf(c)
    if (index !== -1) {
      // Remove the connection
      this.connections.splice(index, 1)
      c.close()
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

  static async bindOn(server:Server, host:string, port:number, fifo:GlobalFifoPromise, shouldAcceptConnection:(pubkey:string, isSync: boolean, syncConnectedPubkeys:string[], connectedPubkeys:string[])=>Promise<boolean>, keyPriorityLevel:(pubkey:string, privilegedKeys:string[])=>Promise<number>, messageHandler:WS2PMessageHandler) {
    const ws2ps = new WS2PServer(server, host, port, fifo, shouldAcceptConnection, keyPriorityLevel)
    await ws2ps.listenToWebSocketConnections(messageHandler)
    server.logger.info('WS2P server %s listening on %s:%s', server.conf.pair.pub, host, port)
    return ws2ps
  }
}