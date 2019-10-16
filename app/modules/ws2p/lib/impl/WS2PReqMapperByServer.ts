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

import {IdentityForRequirements} from '../../../../service/BlockchainService';
import {Server} from "../../../../../server"
import {WS2PReqMapper} from "../interface/WS2PReqMapper"
import {BlockDTO} from "../../../../lib/dto/BlockDTO"
import {DBBlock} from "../../../../lib/db/DBBlock"
import {PeerDTO} from "../../../../lib/dto/PeerDTO"
import {HttpMilestonePage} from "../../../bma/lib/dtos"

export class WS2PReqMapperByServer implements WS2PReqMapper {

  constructor(protected server:Server) {}

  async getCurrent() {
    return this.server.BlockchainService.current()
  }

  async getBlock(number: number): Promise<BlockDTO> {
    return Promise.resolve(BlockDTO.fromJSONObject(await this.server.dal.getFullBlockOf(number)))
  }

  async getBlocks(count: number, from: number): Promise<BlockDTO[]> {
    if (count > 5000) {
      throw 'Count is too high'
    }
    const current = await this.server.dal.getCurrentBlockOrNull()
    if (!current) {
      return []
    }
    count = Math.min(current.number - from + 1, count)
    if (!current || current.number < from) {
      return []
    }
    return (await this.server.dal.getBlocksBetween(from, from + count - 1)).map((b:DBBlock) => BlockDTO.fromJSONObject(b))
  }

  getMilestones(page: number): Promise<HttpMilestonePage> {
    return this.server.milestones(page)
  }

  getMilestonesPage(): Promise<HttpMilestonePage> {
    return this.server.milestones()
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
    const members = await this.server.dal.findReceiversAbove(minsig)
    identities = identities.concat(members)
    const all = await this.server.BlockchainService.requirementsOfIdentities(identities, false)
    return {
      identities: all
    }
  }

  async getPeer(): Promise<PeerDTO> {
    return this.server.PeeringService.peer()
  }

  async getKnownPeers(): Promise<PeerDTO[]> {
    return (await this.server.dal.findAllPeersBut([])).map(p => PeerDTO.fromDBPeer(p))
  }
}