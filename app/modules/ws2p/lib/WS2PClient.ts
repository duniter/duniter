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
import {WS2PMessageHandler} from "./impl/WS2PMessageHandler"
import {WS2PConstants} from "./constants"
import {WS2PStreamer} from "./WS2PStreamer"
import {WS2PSingleWriteStream} from "./WS2PSingleWriteStream"
import {ProxiesConf} from '../../../lib/proxy';

export class WS2PClient {

  private constructor(
    public connection:WS2PConnection,
    private streamer:WS2PStreamer) {
  }

  disableStream() {
    this.streamer.disable()
  }

  static async connectTo(server:Server, fullEndpointAddress:string, endpointVersion:number, expectedWS2PUID:string, messageHandler:WS2PMessageHandler, expectedPub:string, allowKey:(pub:string)=>Promise<boolean> ) {
    const k2 = new Key(server.conf.pair.pub, server.conf.pair.sec)
    const myWs2pId = (server.conf.ws2p && server.conf.ws2p.uuid) ? server.conf.ws2p.uuid:""
    const c = WS2PConnection.newConnectionToAddress(
      Math.min(endpointVersion, WS2PConstants.WS2P_API_VERSION),
      fullEndpointAddress,
      messageHandler,
      new WS2PPubkeyLocalAuth(server.conf.currency , k2, myWs2pId, allowKey),
      new WS2PPubkeyRemoteAuth(server.conf.currency, k2, allowKey),
      ProxiesConf.wsProxy(fullEndpointAddress, server.conf.proxiesConf),
      {
        connectionTimeout: WS2PConstants.REQUEST_TIMEOUT,
        requestTimeout: WS2PConstants.REQUEST_TIMEOUT
      },
      expectedPub,
      expectedWS2PUID
    )
    const singleWriteProtection = new WS2PSingleWriteStream()
    const streamer = new WS2PStreamer(c)
    c.connected
      .then(() => {
        // Streaming
        server
          .pipe(singleWriteProtection)
          .pipe(streamer)
      })
      .catch(() => {
        server.unpipe(singleWriteProtection)
        singleWriteProtection.unpipe(streamer)
      })
    c.closed.then(() => {
      server.unpipe(singleWriteProtection)
      singleWriteProtection.unpipe(streamer)
    })

    // Connecting
    try {
      await c.connect()
    } catch (e) {
      // Immediately close the connection
      c.close()
      throw e
    }
    return new WS2PClient(c, streamer)
  }
}