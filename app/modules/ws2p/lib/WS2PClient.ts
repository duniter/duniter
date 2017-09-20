import {Server} from "../../../../server"
import {WS2PConnection, WS2PPubkeyLocalAuth, WS2PPubkeyRemoteAuth} from "./WS2PConnection"
import {WS2PStreamer} from "../../../lib/streams/WS2PStreamer"
import {Key} from "../../../lib/common-libs/crypto/keyring"
import {WS2PMessageHandler} from "./impl/WS2PMessageHandler"
import {WS2PConstants} from "./constants"

export class WS2PClient {

  private constructor(public connection:WS2PConnection) {}

  static async connectTo(server:Server, host:string, port:number, messageHandler:WS2PMessageHandler, expectedPub:string, allowKey:(pub:string)=>Promise<boolean> ) {
    const k2 = new Key(server.conf.pair.pub, server.conf.pair.sec)
    const c = WS2PConnection.newConnectionToAddress(
      [host, port].join(':'),
      messageHandler,
      new WS2PPubkeyLocalAuth(server.conf.currency , k2, allowKey),
      new WS2PPubkeyRemoteAuth(server.conf.currency, k2, allowKey),
      {
        connectionTimeout: WS2PConstants.REQUEST_TIMEOUT,
        requestTimeout: WS2PConstants.REQUEST_TIMEOUT
      },
      expectedPub
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