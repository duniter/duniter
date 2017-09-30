import {WS2PResponse} from "./WS2PResponse"
import {WS2PConnection} from "../WS2PConnection"
export interface WS2PMessageHandler {

  handlePushMessage(json:any, c:WS2PConnection): Promise<void>
  answerToRequest(json:any): Promise<WS2PResponse>
}