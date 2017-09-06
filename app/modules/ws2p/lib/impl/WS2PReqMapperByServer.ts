import {Server} from "../../../../../server"
import {WS2PReqMapper} from "../interface/WS2PReqMapper"
import {BlockDTO} from "../../../../lib/dto/BlockDTO"

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

  async getRequirementsOfPending(minsig: number): Promise<any> {
    const identities = await this.server.dal.idtyDAL.query('SELECT i.*, count(c.sig) as nbSig FROM idty i, cert c WHERE c.target = i.hash group by i.hash having nbSig >= ?', minsig)
    const all = await this.server.BlockchainService.requirementsOfIdentities(identities, false)
    return {
      identities: all
    }
  }
}