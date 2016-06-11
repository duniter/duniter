"use strict";

var co              = require('co');
var rules           = require('../lib/rules');
var hashf           = require('../lib/ucp/hashf');
var constants       = require('../lib/constants');
var Membership      = require('../lib/entity/membership');
var AbstractService = require('./AbstractService');

module.exports = () => new MembershipService();

function MembershipService () {

  AbstractService.call(this);

  var conf, dal, logger;

  this.setConfDAL = (newConf, newDAL) => {
    dal = newDAL;
    conf = newConf;
    logger = require('../lib/logger')(dal.profile);
  };

  this.current = function (done) {
    dal.getCurrentBlockOrNull(done);
  };

  this.submitMembership = (ms) => this.pushFIFO(() => co(function *() {
    let entry = new Membership(ms);
    entry.idtyHash = (hashf(entry.userid + entry.certts + entry.issuer) + "").toUpperCase();
    logger.info('⬇ %s %s', entry.issuer, entry.membership);
    if (!rules.HELPERS.checkSingleMembershipSignature(entry)) {
      throw constants.ERRORS.WRONG_SIGNATURE_MEMBERSHIP;
    }
    // Get already existing Membership with same parameters
    let found = yield dal.getMembershipForHashAndIssuer(entry);
    if (found) {
      throw constants.ERRORS.ALREADY_RECEIVED_MEMBERSHIP;
    }
    let isMember = yield dal.isMember(entry.issuer);
    let isJoin = entry.membership == 'IN';
    if (!isMember && !isJoin) {
      // LEAVE
      throw constants.ERRORS.MEMBERSHIP_A_NON_MEMBER_CANNOT_LEAVE;
    }
    let current = yield dal.getCurrentBlockOrNull();
    yield rules.HELPERS.checkMembershipBlock(entry, current, conf, dal);
    // Saves entry
    yield dal.savePendingMembership(entry);
    logger.info('✔ %s %s', entry.issuer, entry.membership);
    return entry;
  }));
}
