"use strict";

var co              = require('co');
var rules           = require('../lib/rules');
var hashf           = require('../lib/hashf');
var constants       = require('../lib/constants');

module.exports = function (conf, dal) {
  return new MembershipService(conf, dal);
};

function MembershipService (conf, dal) {

  var logger = require('../lib/logger')(dal.profile);

  this.pair = null;

  var Membership    = require('../lib/entity/membership');

  this.setDAL = function(theDAL) {
    dal = theDAL;
  };

  this.current = function (done) {
    dal.getCurrentBlockOrNull(done);
  };

  let submitMembershipP = (ms) => co(function *() {
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
  });

  this.submitMembership = function (ms, done) {
    return submitMembershipP(ms)
      .then((saved) => {
        done && done(null, saved);
        return saved;
      })
      .catch((err) => {
        done && done(err);
        throw err;
      });
  };
}
