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
    entry.idtyHash = (hashf(entry.userid + entry.certts + entry.issuer) + "").toUpperCase();
    logger.info('⬇ %s %s', entry.issuer, entry.membership);
    if (!rules.HELPERS.checkSingleMembershipSignature(entry)) {
      throw constants.ERRORS.WRONG_SIGNATURE_MEMBERSHIP;
    }
    // Get already existing Membership with same parameters
    const found = yield dal.getMembershipForHashAndIssuer(entry);
    if (found) {
      throw constants.ERRORS.ALREADY_RECEIVED_MEMBERSHIP;
    }
    const isMember = yield dal.isMember(entry.issuer);
    const isJoin = entry.membership == 'IN';
    if (!isMember && !isJoin) {
      // LEAVE
      throw constants.ERRORS.MEMBERSHIP_A_NON_MEMBER_CANNOT_LEAVE;
    }
    const current = yield dal.getCurrentBlockOrNull();
    yield rules.HELPERS.checkMembershipBlock(entry, current, conf, dal);
    // Saves entry
    yield dal.savePendingMembership(entry);
    logger.info('✔ %s %s', entry.issuer, entry.membership);
    return entry;
  }));
}
