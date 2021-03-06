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

import { BlockDTO } from "../../../../lib/dto/BlockDTO";
import { DBBlock } from "../../../../lib/db/DBBlock";
import { PeerDTO } from "../../../../lib/dto/PeerDTO";
import { HttpMilestonePage } from "../../../bma/lib/dtos";

export interface WS2PReqMapper {
  getCurrent(): Promise<DBBlock | null>;
  getBlock(number: number): Promise<BlockDTO>;
  getBlocks(count: number, fromNumber: number): Promise<BlockDTO[]>;
  getRequirementsOfPending(minCert: number): Promise<any>;
  getPeer(): Promise<PeerDTO>;
  getKnownPeers(): Promise<PeerDTO[]>;
  getMilestones(page: number): Promise<HttpMilestonePage>;
  getMilestonesPage(): Promise<HttpMilestonePage>;
}
