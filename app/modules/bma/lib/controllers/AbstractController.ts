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

import {Server} from "../../../../../server"
import {dos2unix} from "../../../../lib/common-libs/dos2unix"
import {CommonConstants} from "../../../../lib/common-libs/constants"
import {BlockchainService} from "../../../../service/BlockchainService"
import {IdentityService} from "../../../../service/IdentityService"
import {PeeringService} from "../../../../service/PeeringService"
import {ConfDTO} from "../../../../lib/dto/ConfDTO"

export abstract class AbstractController {

  constructor(protected server:Server) {
  }

  get conf(): ConfDTO {
    return this.server.conf
  }

  get logger() {
    return this.server.logger
  }

  get BlockchainService(): BlockchainService {
    return this.server.BlockchainService
  }

  get IdentityService(): IdentityService {
    return this.server.IdentityService
  }

  get PeeringService(): PeeringService {
    return this.server.PeeringService
  }

  get MerkleService() {
    return this.server.MerkleService
  }

  async pushEntity<T>(req:any, rawer:(req:any)=>string, task:(raw:string) => Promise<T>): Promise<T> {
    let rawDocument = rawer(req);
    rawDocument = dos2unix(rawDocument);
    try {
      return await task(rawDocument)
    } catch (e) {
      const event = CommonConstants.DocumentError
      this.server.emit(event, e)
      if (e !== "Block already known" && (!e || !e.uerr || (
        e.uerr.ucode !== CommonConstants.ERRORS.PEER_DOCUMENT_ALREADY_KNOWN.uerr.ucode
        && e.uerr.ucode !== CommonConstants.ERRORS.DOCUMENT_BEING_TREATED.uerr.ucode))) {
        this.logger.error(e)
      }
      throw e
    }
  }
}