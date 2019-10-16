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

"use strict";
import {AbstractController} from "./AbstractController"
import {HttpSandbox, HttpSandboxes, HttpSummary} from "../dtos";

export class NodeBinding extends AbstractController {

  summary = (): HttpSummary => {
    return {
      "duniter": {
        "software": "duniter",
        "version": this.server.version,
        "forkWindowSize": this.server.conf.forksize
      }
    }
  }

  async sandboxes(): Promise<HttpSandboxes> {
    return {
      identities: await sandboxIt(this.server.dal.idtyDAL.sandbox),
      memberships: await sandboxIt(this.server.dal.msDAL.sandbox),
      transactions: await sandboxIt(this.server.dal.txsDAL.sandbox)
    }
  }
}

async function sandboxIt(sandbox:any): Promise<HttpSandbox> {
  return {
    size: sandbox.maxSize,
    free: await sandbox.getSandboxRoom()
  }
}
