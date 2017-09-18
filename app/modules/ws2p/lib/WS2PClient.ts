import {Server} from "../../../../server"
import {WS2PConnection, WS2PPubkeyLocalAuth, WS2PPubkeyRemoteAuth} from "./WS2PConnection"
import {WS2PStreamer} from "../../../lib/streams/WS2PStreamer"
import {Key} from "../../../lib/common-libs/crypto/keyring"
import {WS2PMessageHandler} from "./impl/WS2PMessageHandler"

export class WS2PClient {

  private constructor(public connection:WS2PConnection) {}

  static async connectTo(server:Server, host:string, port:number, messageHandler:WS2PMessageHandler) {
    const k2 = new Key(server.conf.pair.pub, server.conf.pair.sec)
    const c = WS2PConnection.newConnectionToAddress(
      [host, port].join(':'),
      messageHandler,
      new WS2PPubkeyLocalAuth(server.conf.currency , k2),
      new WS2PPubkeyRemoteAuth(server.conf.currency, k2)
    )
    // Streaming
    const streamer = new WS2PStreamer(c)
    server.pipe(streamer)
    c.closed.then(() => {
      server.unpipe(streamer)
    })

    // Connecting
    await c.connect()
    return new WS2PClient(c)
  }
}