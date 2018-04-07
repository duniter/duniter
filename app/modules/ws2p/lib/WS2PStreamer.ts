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

import * as stream from "stream"
import {NewLogger} from "../../../lib/logger";
import {WS2PConnection} from "./WS2PConnection";

const logger = NewLogger()

export class WS2PStreamer extends stream.Transform {

  private enabled = true

  constructor(private ws2pc:WS2PConnection) {
    super({ objectMode: true })
  }

  enable() {
    this.enabled = true
  }

  disable() {
    this.enabled = false
  }

  async _write(obj:any, enc:any, done:any) {
    if (!this.enabled) {
      return done && done()
    }
    try {
      if (obj.joiners) {
        await this.ws2pc.pushBlock(obj)
      }
      else if (obj.pubkey && obj.uid) {
        await this.ws2pc.pushIdentity(obj)
      }
      else if (obj.idty_uid) {
        await this.ws2pc.pushCertification(obj)
      }
      else if (obj.userid) {
        await this.ws2pc.pushMembership(obj)
      }
      else if (obj.issuers) {
        await this.ws2pc.pushTransaction(obj)
      }
      else if (obj.endpoints) {
        await this.ws2pc.pushPeer(obj)
      }
    } catch (e) {
      logger.warn('WS2P >> Streamer >>', e)
      this.ws2pc.close()
    }
    done && done();
  }
}
