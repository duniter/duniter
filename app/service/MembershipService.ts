"use strict";
import {GlobalFifoPromise} from "./GlobalFifoPromise"
import {ConfDTO} from "../lib/dto/ConfDTO"
import {FileDAL} from "../lib/dal/fileDAL"

const rules           = require('../lib/rules')
const hashf           = require('duniter-common').hashf;
const constants       = require('../lib/constants');
const Membership      = require('../lib/entity/membership');

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
    return GlobalFifoPromise.pushFIFO(async () => {
      const entry = new Membership(ms);
      // Force usage of local currency name, do not accept other currencies documents
      entry.currency = this.conf.currency || entry.currency;
      entry.idtyHash = (hashf(entry.userid + entry.certts + entry.issuer) + "").toUpperCase();
      this.logger.info('⬇ %s %s', entry.issuer, entry.membership);
      if (!rules.HELPERS.checkSingleMembershipSignature(entry)) {
        throw constants.ERRORS.WRONG_SIGNATURE_MEMBERSHIP;
      }
      // Get already existing Membership with same parameters
      const mostRecentNumber = await this.dal.getMostRecentMembershipNumberForIssuer(entry.issuer);
      const thisNumber = parseInt(entry.block);
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
      const basedBlock = await rules.HELPERS.checkMembershipBlock(entry, current, this.conf, this.dal);
      if (basedBlock) {
        entry.expires_on = basedBlock.medianTime + this.conf.msWindow;
      }
      entry.pubkey = entry.issuer;
      if (!(await this.dal.msDAL.sandbox.acceptNewSandBoxEntry(entry, this.conf.pair && this.conf.pair.pub))) {
        throw constants.ERRORS.SANDBOX_FOR_MEMERSHIP_IS_FULL;
      }
      // Saves entry
      await this.dal.savePendingMembership(entry);
      this.logger.info('✔ %s %s', entry.issuer, entry.membership);
      return entry;
    })
  }
}
