import {Server} from "../../../../server"
import {WS2PConnection, WS2PPubkeyLocalAuth, WS2PPubkeyRemoteAuth} from "./WS2PConnection"
import {Key} from "../../../lib/common-libs/crypto/keyring"
import {WS2PMessageHandler} from "./impl/WS2PMessageHandler"
import {WS2PConstants} from "./constants"
import { WS2PStreamer } from "./WS2PStreamer";

export class WS2PClient {

  private constructor(public connection:WS2PConnection) {}

  static async connectTo(server:Server, fullEndpointAddress:string, messageHandler:WS2PMessageHandler, expectedPub:string, allowKey:(pub:string)=>Promise<boolean> ) {
    const k2 = new Key(server.conf.pair.pub, server.conf.pair.sec)
    const c = WS2PConnection.newConnectionToAddress(
      fullEndpointAddress,
      messageHandler,
      new WS2PPubkeyLocalAuth(server.conf.currency , k2, allowKey),
      new WS2PPubkeyRemoteAuth(server.conf.currency, k2, allowKey),
      {
        connectionTimeout: WS2PConstants.REQUEST_TIMEOUT,
        requestTimeout: WS2PConstants.REQUEST_TIMEOUT
      },
      expectedPub
    )
    const streamer = new WS2PStreamer(c)
    c.connected
      .then(() => {
        // Streaming
        server.pipe(streamer)
      })
      .catch(() => {
        server.unpipe(streamer)
      })
    c.closed.then(() => {
      server.unpipe(streamer)
    })

    // Connecting
    try {
      await c.connect()
    } catch (e) {
      // Immediately close the connection
      c.close()
      throw e
    }
    return new WS2PClient(c)
  }
}