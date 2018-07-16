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
import {WS2PRequester} from "../../../ws2p/lib/WS2PRequester";
import {DBPeer, JSONDBPeer} from "../../../../lib/db/DBPeer";
import {BlockDTO} from "../../../../lib/dto/BlockDTO";
import {PeerDTO} from "../../../../lib/dto/PeerDTO";
import {HttpRequirements} from "../../../bma/lib/dtos";

const logger = NewLogger()

export class WS2PRemoteContacter implements IRemoteContacter {

  getRequirementsPending(min: number): Promise<HttpRequirements> {
    return this.requester.getRequirementsPending(min)
  }

  constructor(protected requester: WS2PRequester) {
  }

  getBlock(number: number): Promise<BlockDTO | null> {
    return this.requester.getBlock(number)
  }

  getCurrent(): Promise<BlockDTO | null> {
    return this.requester.getCurrent()
  }

  async getPeers(): Promise<(JSONDBPeer | null)[]> {
    return (await this.requester.getPeers()).map(p => DBPeer.fromPeerDTO(PeerDTO.fromJSONObject(p)))
  }

  getName(): string {
    return "WS2P remote"
  }
}
