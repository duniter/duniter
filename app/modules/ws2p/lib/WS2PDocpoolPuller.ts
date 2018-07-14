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

import {Server} from "../../../../server"
import {WS2PConnection} from "./WS2PConnection"
import {WS2PRequester} from "./WS2PRequester"
import {pullSandboxToLocalServer} from "../../crawler/lib/sandbox"

export class WS2PDocpoolPuller {

  constructor(
    private server:Server,
    private connection:WS2PConnection
  ) {}

  async pull() {
    const requester = WS2PRequester.fromConnection(this.connection)
    // node.pubkey = p.pubkey;
    return pullSandboxToLocalServer(this.server.conf.currency, {
      getRequirementsPending: (minCert = 1) => {
        return requester.getRequirementsPending(minCert)
      }
    }, this.server, this.server.logger)
  }
}
