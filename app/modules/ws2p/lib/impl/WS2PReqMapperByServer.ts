import { IdentityForRequirements } from './../../../../service/BlockchainService';
import {Server} from "../../../../../server"
import {WS2PReqMapper} from "../interface/WS2PReqMapper"
import {BlockDTO} from "../../../../lib/dto/BlockDTO"
import { IindexEntry } from '../../../../lib/indexer';

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
    let identities:IdentityForRequirements[] = await this.server.dal.idtyDAL.query(
      'SELECT i.*, count(c.sig) as nbSig ' +
      'FROM idty i, cert c ' +
      'WHERE c.target = i.hash group by i.hash having nbSig >= ?',
      minsig)
    const members:IdentityForRequirements[] = (await this.server.dal.idtyDAL.query(
      'SELECT i.*, count(c.sig) as nbSig ' +
      'FROM i_index i, cert c ' +
      'WHERE c.`to` = i.pub group by i.pub having nbSig >= ?',
      minsig)).map((i:IindexEntry):IdentityForRequirements => {
        return {
          hash: i.hash || "",
          member: i.member || false,
          wasMember: i.wasMember || false,
          pubkey: i.pub,
          uid: i.uid || "",
          buid: i.created_on || "",
          sig: i.sig || "",
          revocation_sig: "",
          revoked: false,
          revoked_on: 0
        }
      })
    identities = identities.concat(members)
    const all = await this.server.BlockchainService.requirementsOfIdentities(identities, false)
    return {
      identities: all
    }
  }
}