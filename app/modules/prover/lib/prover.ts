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
import {PermanentProver} from "./permanentProver"
import * as stream from "stream"
import {OtherConstants} from "../../../lib/other_constants"
import {Server} from "../../../../server"

export class Prover extends stream.Transform {

  permaProver:PermanentProver

  constructor(server:Server) {
    super({ objectMode: true })
    this.permaProver = new PermanentProver(server)
  }

  _write(obj:any, enc:any, done:any) {
    // Never close the stream
    if (obj) {
      if (obj.bcEvent && obj.bcEvent === OtherConstants.BC_EVENT.HEAD_CHANGED || obj.bcEvent === OtherConstants.BC_EVENT.SWITCHED) {
        this.permaProver.blockchainChanged(obj.block);
      } else if (obj.cpu !== undefined) {
        this.permaProver.prover.changeCPU(obj.cpu); // We multiply by 10 to give room to computers with < 100 cores
      }
    }
    done && done();
  };

  async startService() {
    this.permaProver.allowedToStart();
  }

  async stopService() {
    await this.permaProver.stopEveryting();
  }
}
