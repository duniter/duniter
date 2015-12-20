"use strict";

var _ = require('underscore');
var async           = require('async');
var constants       = require('../lib/constants');
var localValidator  = require('../lib/localValidator');
var globalValidator = require('../lib/globalValidator');
var blockchainDao   = require('../lib/blockchainDao');

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

  this.submitMembership = function (ms, done) {
    var entry = new Membership(ms);
    var globalValidation = globalValidator(conf, blockchainDao(null, dal));
    async.waterfall([
      function (next){
        logger.info('⬇ %s %s', entry.issuer, entry.membership);
        if (!localValidator().checkSingleMembershipSignature(entry)) {
          return next(constants.ERRORS.WRONG_SIGNATURE_MEMBERSHIP);
        }
        // Get already existing Membership with same parameters
        dal.getMembershipForHashAndIssuer(entry).then(_.partial(next, null)).catch(next);
      },
      function (found, next){
        if (found) {
          next(constants.ERRORS.ALREADY_RECEIVED_MEMBERSHIP);
        }
        else dal.isMember(entry.issuer, next);
      },
      function (isMember, next){
        var isJoin = entry.membership == 'IN';
        if (!isMember && isJoin) {
          // JOIN
          next();
        }
        else if (isMember && !isJoin) {
          // LEAVE
          next();
        } else {
          if (isJoin)
            // RENEW
            next();
          else
            next(constants.ERRORS.MEMBERSHIP_A_NON_MEMBER_CANNOT_LEAVE);
        }
      },
      function (next) {
        dal.getCurrentBlockOrNull(next);
      },
      function (current, next) {
        globalValidation.checkMembershipBlock(entry, current, next);
      },
      function (next){
        // Saves entry
        dal.savePendingMembership(entry).then(function() {
          next();
        }).catch(next);
      },
      function (next){
        logger.info('✔ %s %s', entry.issuer, entry.membership);
        next(null, entry);
      }
    ], done);
  };
}
