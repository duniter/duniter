import {Server} from "../../../../server"
import {WS2PReqMapper} from "../interface/WS2PReqMapper"

export class WS2PReqMapperByServer implements WS2PReqMapper {

  constructor(protected server:Server) {}

  async getCurrent() {
    return this.server.BlockchainService.current()
  }
}