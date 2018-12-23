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

import {NewLogger} from "../../../../lib/logger"
import {IRemoteContacter} from "./IRemoteContacter";
import {Contacter} from "../contacter";
import {HttpRequirements} from "../../../bma/lib/dtos";
import {JSONDBPeer} from "../../../../lib/db/DBPeer";
import {BlockDTO} from "../../../../lib/dto/BlockDTO";

const logger = NewLogger()

export class BMARemoteContacter implements IRemoteContacter {

  constructor(protected contacter: Contacter) {
  }

  getBlock(number: number): Promise<BlockDTO | null> {
    return this.contacter.getBlock(number)
  }

  getCurrent(): Promise<BlockDTO | null> {
    return this.contacter.getCurrent()
  }

  getBlocks(count: number, from: number): Promise<BlockDTO[]> {
    return this.contacter.getBlocks(count, from)
  }

  getMilestones(page: number): Promise<{ chunkSize: number; totalPages: number; currentPage: number; milestonesPerPage: number; blocks: BlockDTO[] }> {
    return this.contacter.getMilestones(page)
  }

  getMilestonesPage(): Promise<{ chunkSize: number; totalPages: number; milestonesPerPage: number }> {
    return this.contacter.getMilestonesPage()
  }

  async getPeers(): Promise<(JSONDBPeer|null)[]> {
    return (await this.contacter.getPeersArray()).peers
  }

  getRequirementsPending(minsig: number): Promise<HttpRequirements> {
    return this.contacter.getRequirementsPending(minsig)
  }

  getName(): string {
    return "BMA remote '" + this.contacter.fullyQualifiedHost + "'"
  }

  get hostName() {
    return this.contacter.host
  }
}
