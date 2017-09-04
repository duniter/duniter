import {WS2PResponse} from "./WS2PResponse"
export interface WS2PMessageHandler {

  handlePushMessage(json:any): Promise<void>
  handleRequestMessage(json:any): Promise<WS2PResponse>
}