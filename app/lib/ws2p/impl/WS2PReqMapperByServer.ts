import {Server} from "../../../../server"
import {WS2PReqMapper} from "../interface/WS2PReqMapper"
import {BlockDTO} from "../../dto/BlockDTO"

export class WS2PReqMapperByServer implements WS2PReqMapper {

  constructor(protected server:Server) {}

  async getCurrent() {
    return this.server.BlockchainService.current()
  }

  getBlock(number: number): Promise<BlockDTO[]> {
    return this.server.dal.getBlock(number)
  }

  async getBlocks(count: number, from: number): Promise<BlockDTO[]> {
    if (count > 5000) {
      throw 'Count is too high'
    }
    const current = await this.server.dal.getCurrentBlockOrNull()
    count = Math.min(current.number - from + 1, count)
    if (!current || current.number < from) {
      return []
    }
    return this.server.dal.getBlocksBetween(from, from + count - 1)
  }
}