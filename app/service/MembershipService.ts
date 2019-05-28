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
import {GlobalFifoPromise} from "./GlobalFifoPromise";
import {ConfDTO} from "../lib/dto/ConfDTO";
import {FileDAL} from "../lib/dal/fileDAL";
import {LOCAL_RULES_HELPERS} from "../lib/rules/local_rules";
import {GLOBAL_RULES_HELPERS} from "../lib/rules/global_rules";
import {MembershipDTO} from "../lib/dto/MembershipDTO";
import {FIFOService} from "./FIFOService";
import {DBBlock} from "../lib/db/DBBlock"
import {DataErrors} from "../lib/common-libs/errors"

const constants       = require('../lib/constants');

export class MembershipService extends FIFOService {

  constructor(fifoPromiseHandler:GlobalFifoPromise) {
    super(fifoPromiseHandler)
  }

  conf:ConfDTO
  dal:FileDAL
  logger:any

  setConfDAL(newConf:ConfDTO, newDAL:FileDAL) {
    this.dal = newDAL;
    this.conf = newConf;
    this.logger = require('../lib/logger').NewLogger(this.dal.profile);
  }

  current(): Promise<DBBlock | null> {
    return this.dal.getCurrentBlockOrNull()
  }

  submitMembership(ms:any) {
    const entry = MembershipDTO.fromJSONObject(ms)
    const hash = entry.getHash()
    return this.pushFIFO<MembershipDTO>(hash, async () => {
      // Force usage of local currency name, do not accept other currencies documents
      entry.currency = this.conf.currency || entry.currency;
      this.logger.info('⬇ %s %s', entry.issuer, entry.membership);
      if (!LOCAL_RULES_HELPERS.checkSingleMembershipSignature(entry)) {
        throw constants.ERRORS.WRONG_SIGNATURE_MEMBERSHIP;
      }
      // Get already existing Membership with same parameters
      const mostRecentNumber = await this.dal.getMostRecentMembershipNumberForIssuer(entry.issuer);
      const thisNumber = entry.number
      if (mostRecentNumber == thisNumber) {
        throw constants.ERRORS.ALREADY_RECEIVED_MEMBERSHIP;
      } else if (mostRecentNumber > thisNumber) {
        throw constants.ERRORS.A_MORE_RECENT_MEMBERSHIP_EXISTS;
      }
      const isMember = await this.dal.isMember(entry.issuer);
      const isJoin = entry.membership == 'IN';
      if (!isMember && !isJoin) {
        // LEAVE
        throw constants.ERRORS.MEMBERSHIP_A_NON_MEMBER_CANNOT_LEAVE;
      }
      const current = await this.dal.getCurrentBlockOrNull();
      const basedBlock = await GLOBAL_RULES_HELPERS.checkMembershipBlock(entry, current, this.conf, this.dal);
      if (!(await this.dal.msDAL.sandbox.acceptNewSandBoxEntry({
          issuers: [entry.pubkey],
          block_number: entry.block_number
        }, this.conf.pair && this.conf.pair.pub))) {
        throw constants.ERRORS.SANDBOX_FOR_MEMERSHIP_IS_FULL;
      }
      const expires_on = basedBlock ? basedBlock.medianTime + this.conf.msWindow : 0
      if (current && expires_on < current.medianTime) {
        throw DataErrors[DataErrors.MEMBERSHIP_WINDOW_IS_PASSED]
      }
      // Saves entry
      await this.dal.savePendingMembership({
        issuers: [entry.pubkey],
        membership: entry.membership,
        issuer: entry.issuer,
        number: entry.number,
        blockNumber: entry.number,
        blockHash: entry.fpr,
        userid: entry.userid,
        certts: entry.certts,
        block: entry.blockstamp,
        fpr: entry.fpr,
        idtyHash: entry.getIdtyHash(),
        written: false,
        written_number: null,
        expires_on,
        signature: entry.signature,
        expired: false,
        block_number: entry.number
      });
      this.logger.info('✔ %s %s', entry.issuer, entry.membership);
      return entry;
    })
  }
}
