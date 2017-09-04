import {WS2PConnection} from "./WS2PConnection"

enum WS2P_REQ {
  CURRENT
}

export class WS2PRequester {

  private constructor(
    protected ws2pc:WS2PConnection) {}

  static fromConnection(ws2pc:WS2PConnection) {
    return new WS2PRequester(ws2pc)
  }

  getCurrent() {
    return this.query(WS2P_REQ.CURRENT)
  }

  private query(req:WS2P_REQ) {
    return this.ws2pc.request({
      name: WS2P_REQ[req]
    })
  }
}