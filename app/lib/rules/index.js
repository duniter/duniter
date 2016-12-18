"use strict";

const _ = require('underscore');
const co          = require('co');
const Block = require('../entity/block');
const local_rules = require('./local_rules');
const global_rules = require('./global_rules');

let rules = {};

rules.LOCAL = local_rules.FUNCTIONS;
rules.GLOBAL = global_rules.FUNCTIONS;

rules.HELPERS = {};

_.extend(rules.HELPERS, local_rules.HELPERS);
_.extend(rules.HELPERS, global_rules.HELPERS);

rules.ALIAS = {

  ALL_LOCAL: (block, conf) => co(function *() {
    yield rules.LOCAL.checkVersion(block);
    yield rules.LOCAL.checkParameters(block);
    yield rules.LOCAL.checkProofOfWork(block);
    yield rules.LOCAL.checkInnerHash(block);
    yield rules.LOCAL.checkPreviousHash(block);
    yield rules.LOCAL.checkPreviousIssuer(block);
    yield rules.LOCAL.checkUnitBase(block);
    yield rules.LOCAL.checkBlockSignature(block);
    yield rules.LOCAL.checkBlockTimes(block, conf);
    yield rules.LOCAL.checkIdentitiesSignature(block);
    yield rules.LOCAL.checkIdentitiesUserIDConflict(block, conf);
    yield rules.LOCAL.checkIdentitiesPubkeyConflict(block, conf);
    yield rules.LOCAL.checkIdentitiesMatchJoin(block, conf);
    yield rules.LOCAL.checkMembershipUnicity(block, conf);
    yield rules.LOCAL.checkRevokedUnicity(block, conf);
    yield rules.LOCAL.checkRevokedAreExcluded(block, conf);
    yield rules.LOCAL.checkMembershipsSignature(block);
    yield rules.LOCAL.checkPubkeyUnicity(block);
    yield rules.LOCAL.checkCertificationOneByIssuer(block, conf);
    yield rules.LOCAL.checkCertificationUnicity(block, conf);
    yield rules.LOCAL.checkCertificationIsntForLeaverOrExcluded(block, conf);
    yield rules.LOCAL.checkTxVersion(block);
    yield rules.LOCAL.checkTxIssuers(block);
    yield rules.LOCAL.checkTxSources(block);
    yield rules.LOCAL.checkTxRecipients(block);
    yield rules.LOCAL.checkTxAmounts(block);
    yield rules.LOCAL.checkTxSignature(block);
  }),

  ALL_LOCAL_BUT_POW_AND_SIGNATURE: (block, conf) => co(function *() {
    yield rules.LOCAL.checkVersion(block);
    yield rules.LOCAL.checkParameters(block);
    yield rules.LOCAL.checkInnerHash(block);
    yield rules.LOCAL.checkPreviousHash(block);
    yield rules.LOCAL.checkPreviousIssuer(block);
    yield rules.LOCAL.checkUnitBase(block);
    yield rules.LOCAL.checkBlockTimes(block, conf);
    yield rules.LOCAL.checkIdentitiesSignature(block);
    yield rules.LOCAL.checkIdentitiesUserIDConflict(block, conf);
    yield rules.LOCAL.checkIdentitiesPubkeyConflict(block, conf);
    yield rules.LOCAL.checkIdentitiesMatchJoin(block, conf);
    yield rules.LOCAL.checkMembershipUnicity(block, conf);
    yield rules.LOCAL.checkRevokedUnicity(block, conf);
    yield rules.LOCAL.checkRevokedAreExcluded(block, conf);
    yield rules.LOCAL.checkMembershipsSignature(block);
    yield rules.LOCAL.checkPubkeyUnicity(block);
    yield rules.LOCAL.checkCertificationOneByIssuer(block, conf);
    yield rules.LOCAL.checkCertificationUnicity(block, conf);
    yield rules.LOCAL.checkCertificationIsntForLeaverOrExcluded(block, conf);
    yield rules.LOCAL.checkTxVersion(block);
    yield rules.LOCAL.checkTxIssuers(block);
    yield rules.LOCAL.checkTxSources(block);
    yield rules.LOCAL.checkTxRecipients(block);
    yield rules.LOCAL.checkTxAmounts(block);
    yield rules.LOCAL.checkTxSignature(block);
  }),

  ALL_GLOBAL: (block, conf, dal, bcContext) => co(function *() {
    yield rules.GLOBAL.checkIdentityUnicity(block, conf, dal);
    yield rules.GLOBAL.checkPubkeyUnicity(block, conf, dal);
    yield rules.GLOBAL.checkIdentitiesAreWritable(block, conf, dal);
    yield rules.GLOBAL.checkMembershipsAreWritable(block, conf, dal);
    yield rules.GLOBAL.checkJoiners(block, conf, dal);
    yield rules.GLOBAL.checkJoinersHaveEnoughCertifications(block, conf, dal);
    yield rules.GLOBAL.checkJoinersAreNotOudistanced(block, conf, dal);
    yield rules.GLOBAL.checkActives(block, conf, dal);
    yield rules.GLOBAL.checkActivesAreNotOudistanced(block, conf, dal);
    yield rules.GLOBAL.checkLeavers(block, conf, dal);
    yield rules.GLOBAL.checkRevoked(block, conf, dal);
    yield rules.GLOBAL.checkJoinersAreNotRevoked(block, conf, dal);
    yield rules.GLOBAL.checkExcluded(block, conf, dal);
    yield rules.GLOBAL.checkKickedMembersAreExcluded(block, conf, dal);
    yield rules.GLOBAL.checkCertificationsAreWritable(block, conf, dal);
    yield rules.GLOBAL.checkCertificationsAreMadeByMembers(block, dal);
    yield rules.GLOBAL.checkCertificationsAreValid(block, conf, dal);
    yield rules.GLOBAL.checkCertificationsAreMadeToMembers(block, dal);
    yield rules.GLOBAL.checkCertificationsAreMadeToNonLeaver(block, dal);
    yield rules.GLOBAL.checkCertificationsDelayIsRespected(block, conf, dal);
    yield rules.GLOBAL.checkCertificationsPeriodIsRespected(block, conf, dal);
    yield rules.GLOBAL.checkTransactionsBlockStamp(block, conf, dal);
    yield rules.GLOBAL.checkSourcesAvailability(block, conf, dal);
  }),

  ALL_GLOBAL_WITHOUT_POW: (block, conf, dal, bcContext) => co(function *() {
    yield rules.GLOBAL.checkIdentityUnicity(block, conf, dal);
    yield rules.GLOBAL.checkPubkeyUnicity(block, conf, dal);
    yield rules.GLOBAL.checkIdentitiesAreWritable(block, conf, dal);
    yield rules.GLOBAL.checkMembershipsAreWritable(block, conf, dal);
    yield rules.GLOBAL.checkJoiners(block, conf, dal);
    yield rules.GLOBAL.checkJoinersHaveEnoughCertifications(block, conf, dal);
    yield rules.GLOBAL.checkJoinersAreNotOudistanced(block, conf, dal);
    yield rules.GLOBAL.checkActives(block, conf, dal);
    yield rules.GLOBAL.checkActivesAreNotOudistanced(block, conf, dal);
    yield rules.GLOBAL.checkLeavers(block, conf, dal);
    yield rules.GLOBAL.checkRevoked(block, conf, dal);
    yield rules.GLOBAL.checkJoinersAreNotRevoked(block, conf, dal);
    yield rules.GLOBAL.checkExcluded(block, conf, dal);
    yield rules.GLOBAL.checkKickedMembersAreExcluded(block, conf, dal);
    yield rules.GLOBAL.checkCertificationsAreWritable(block, conf, dal);
    yield rules.GLOBAL.checkCertificationsAreMadeByMembers(block, dal);
    yield rules.GLOBAL.checkCertificationsAreValid(block, conf, dal);
    yield rules.GLOBAL.checkCertificationsAreMadeToMembers(block, dal);
    yield rules.GLOBAL.checkCertificationsAreMadeToNonLeaver(block, dal);
    yield rules.GLOBAL.checkCertificationsDelayIsRespected(block, conf, dal);
    yield rules.GLOBAL.checkCertificationsPeriodIsRespected(block, conf, dal);
    yield rules.GLOBAL.checkTransactionsBlockStamp(block, conf, dal);
    yield rules.GLOBAL.checkSourcesAvailability(block, conf, dal);
  })
};

rules.CHECK = {
  ASYNC: {
    ALL_LOCAL: checkLocal(rules.ALIAS.ALL_LOCAL),
    ALL_LOCAL_BUT_POW: checkLocal(rules.ALIAS.ALL_LOCAL_BUT_POW_AND_SIGNATURE),
    ALL_GLOBAL: check(rules.ALIAS.ALL_GLOBAL),
    ALL_GLOBAL_BUT_POW: check(rules.ALIAS.ALL_GLOBAL_WITHOUT_POW)
  }
};

function checkLocal(contract) {
  return (b, conf, done) => {
    return co(function *() {
      const block = new Block(b);
      yield contract(block, conf);
      done && done();
    })
      .catch((err) => {
        if (done) return done(err);
        throw err;
      });
  };
}

function check(contract) {
  return (b, conf, dal, bcContext, done) => {
    return co(function *() {
      const block = new Block(b);
      yield contract(block, conf, dal, bcContext);
      done && done();
    })
      .catch((err) => {
        if (done) return done(err);
        throw err;
      });
  };
}

module.exports = rules;
