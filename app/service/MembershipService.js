"use strict";

const co              = require('co');
const rules           = require('../lib/rules');
const hashf           = require('../lib/ucp/hashf');
const constants       = require('../lib/constants');
const Membership      = require('../lib/entity/membership');
const AbstractService = require('./AbstractService');

module.exports = () => {
  return new MembershipService();
};

function MembershipService () {

  AbstractService.call(this);

  let conf, dal, logger;

  this.setConfDAL = (newConf, newDAL) => {
    dal = newDAL;
    conf = newConf;
    logger = require('../lib/logger')(dal.profile);
  };

  this.current = () => dal.getCurrentBlockOrNull();

  this.submitMembership = (ms) => this.pushFIFO(() => co(function *() {
    const entry = new Membership(ms);
    // Force usage of local currency name, do not accept other currencies documents
    entry.currency = conf.currency || entry.currency;
    entry.idtyHash = (hashf(entry.userid + entry.certts + entry.issuer) + "").toUpperCase();
    logger.info('⬇ %s %s', entry.issuer, entry.membership);
    if (!rules.HELPERS.checkSingleMembershipSignature(entry)) {
      throw constants.ERRORS.WRONG_SIGNATURE_MEMBERSHIP;
    }
    // Get already existing Membership with same parameters
    const mostRecentNumber = yield dal.getMostRecentMembershipNumberForIssuer(entry.issuer);
    const thisNumber = parseInt(entry.block);
    if (mostRecentNumber == thisNumber) {
      throw constants.ERRORS.ALREADY_RECEIVED_MEMBERSHIP;
    } else if (mostRecentNumber > thisNumber) {
      throw constants.ERRORS.A_MORE_RECENT_MEMBERSHIP_EXISTS;
    }
    const isMember = yield dal.isMember(entry.issuer);
    const isJoin = entry.membership == 'IN';
    if (!isMember && !isJoin) {
      // LEAVE
      throw constants.ERRORS.MEMBERSHIP_A_NON_MEMBER_CANNOT_LEAVE;
    }
    const current = yield dal.getCurrentBlockOrNull();
    const basedBlock = yield rules.HELPERS.checkMembershipBlock(entry, current, conf, dal);
    if (basedBlock) {
      entry.expires_on = basedBlock.medianTime + conf.msWindow;
    }
    entry.pubkey = entry.issuer;
    if (!(yield dal.msDAL.sandbox.acceptNewSandBoxEntry(entry, conf.pair && conf.pair.pub))) {
      throw constants.ERRORS.SANDBOX_FOR_MEMERSHIP_IS_FULL;
    }
    // Saves entry
    yield dal.savePendingMembership(entry);
    logger.info('✔ %s %s', entry.issuer, entry.membership);
    return entry;
  }));
}
