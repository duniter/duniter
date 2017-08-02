"use strict";
import {GlobalFifoPromise} from "./GlobalFifoPromise"
import {ConfDTO} from "../lib/dto/ConfDTO"
import {FileDAL} from "../lib/dal/fileDAL"
import {LOCAL_RULES_HELPERS} from "../lib/rules/local_rules"
import {GLOBAL_RULES_HELPERS} from "../lib/rules/global_rules"
import {MembershipDTO} from "../lib/dto/MembershipDTO"

const constants       = require('../lib/constants');

export class MembershipService {

  conf:ConfDTO
  dal:FileDAL
  logger:any

  setConfDAL(newConf:ConfDTO, newDAL:FileDAL) {
    this.dal = newDAL;
    this.conf = newConf;
    this.logger = require('../lib/logger').NewLogger(this.dal.profile);
  }

  current() {
    return this.dal.getCurrentBlockOrNull()
  }

  submitMembership(ms:any) {
    return GlobalFifoPromise.pushFIFO<MembershipDTO>(async () => {
      const entry = MembershipDTO.fromJSONObject(ms)
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
          pubkey: entry.pubkey,
          block_number: entry.block_number
        }, this.conf.pair && this.conf.pair.pub))) {
        throw constants.ERRORS.SANDBOX_FOR_MEMERSHIP_IS_FULL;
      }
      // Saves entry
      await this.dal.savePendingMembership({
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
        expires_on: basedBlock ? basedBlock.medianTime + this.conf.msWindow : null,
        signature: entry.signature,
        expired: false,
        block_number: entry.number
      });
      this.logger.info('✔ %s %s', entry.issuer, entry.membership);
      return entry;
    })
  }
}
