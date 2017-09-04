import {WS2PReqMapper} from "./WS2PReqMapper"

enum WS2P_REQ {
  CURRENT
}

export enum WS2P_REQERROR {
  UNKNOWN_REQUEST
}

export async function WS2PResponder(data:any, handler:WS2PReqMapper) {

  /**********
   * REQUEST
   *********/
  if (data.reqId && typeof data.reqId === "string") {

    let body:any = {}

    if (data.body && data.body.name) {
      switch (data.body.name) {
        case WS2P_REQ[WS2P_REQ.CURRENT]:
          body = await handler.getCurrent()
          break;
        default:
          throw Error(WS2P_REQERROR[WS2P_REQERROR.UNKNOWN_REQUEST])
      }
    }

    return body
  }

  /**********
   *  PUSH
   *********/
  else {

  }
}