// Source file from duniter: Crypto-currency software to manage libre currency such as Ğ1
// Copyright (C) 2018  Cedric Moreau <cem.moreau@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

import {IdentityForRequirements} from './../../../../service/BlockchainService';
import {Server} from "../../../../../server"
import {WS2PReqMapper} from "../interface/WS2PReqMapper"
import {BlockDTO} from "../../../../lib/dto/BlockDTO"
import {IindexEntry} from '../../../../lib/indexer';

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
    let identities:IdentityForRequirements[] = (await this.server.dal.idtyDAL.query(
      'SELECT i.*, count(c.sig) as nbSig ' +
      'FROM idty i, cert c ' +
      'WHERE c.target = i.hash group by i.hash having nbSig >= ?',
      [minsig])).map(i => ({
      hash: i.hash || "",
      member: i.member || false,
      wasMember: i.wasMember || false,
      pubkey: i.pubkey,
      uid: i.uid || "",
      buid: i.buid || "",
      sig: i.sig || "",
      revocation_sig: i.revocation_sig,
      revoked: i.revoked,
      revoked_on: i.revoked_on ? 1 : 0
    }))
    const members:IdentityForRequirements[] = (await this.server.dal.iindexDAL.query(
      'SELECT i.*, count(c.sig) as nbSig ' +
      'FROM i_index i, cert c ' +
      'WHERE c.`to` = i.pub group by i.pub having nbSig >= ?',
      [minsig])).map((i:IindexEntry):IdentityForRequirements => {
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