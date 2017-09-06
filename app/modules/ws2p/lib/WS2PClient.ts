import {Server} from "../../../../server"
import {WS2PConnection, WS2PPubkeyLocalAuth, WS2PPubkeyRemoteAuth} from "./WS2PConnection"
import {WS2PServerMessageHandler} from "./interface/WS2PServerMessageHandler"
import {WS2PStreamer} from "../../../lib/streams/WS2PStreamer"
import {Key} from "../../../lib/common-libs/crypto/keyring"

export class WS2PClient {

  private constructor(public connection:WS2PConnection) {}

  static async connectTo(server:Server, host:string, port:number) {
    const k2 = new Key(server.conf.pair.pub, server.conf.pair.sec)
    const c = WS2PConnection.newConnectionToAddress(
      [host, port].join(':'),
      new WS2PServerMessageHandler(server),
      new WS2PPubkeyLocalAuth(k2),
      new WS2PPubkeyRemoteAuth(k2)
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