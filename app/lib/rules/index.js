"use strict";

const _           = require('underscore');
const co          = require('co');
const common      = require('duniter-common');

const local_rules  = require('../rules/local_rules')
const global_rules = require('../rules/global_rules').rules
const Block        = common.document.Block

let rules = {};

rules.LOCAL = local_rules.FUNCTIONS;
rules.GLOBAL = global_rules.FUNCTIONS;

rules.HELPERS = {};

_.extend(rules.HELPERS, local_rules.HELPERS);
_.extend(rules.HELPERS, global_rules.HELPERS);

rules.ALIAS = {

  ALL_LOCAL: (block, conf, index) => co(function *() {
    yield rules.LOCAL.checkParameters(block);
    yield rules.LOCAL.checkProofOfWork(block);
    yield rules.LOCAL.checkInnerHash(block);
    yield rules.LOCAL.checkPreviousHash(block);
    yield rules.LOCAL.checkPreviousIssuer(block);
    yield rules.LOCAL.checkUnitBase(block);
    yield rules.LOCAL.checkBlockSignature(block);
    yield rules.LOCAL.checkBlockTimes(block, conf);
    yield rules.LOCAL.checkIdentitiesSignature(block);
    yield rules.LOCAL.checkIdentitiesUserIDConflict(block, conf, index);
    yield rules.LOCAL.checkIdentitiesPubkeyConflict(block, conf, index);
    yield rules.LOCAL.checkIdentitiesMatchJoin(block, conf, index);
    yield rules.LOCAL.checkMembershipUnicity(block, conf, index);
    yield rules.LOCAL.checkRevokedUnicity(block, conf, index);
    yield rules.LOCAL.checkRevokedAreExcluded(block, conf, index);
    yield rules.LOCAL.checkMembershipsSignature(block);
    yield rules.LOCAL.checkPubkeyUnicity(block);
    yield rules.LOCAL.checkCertificationOneByIssuer(block, conf, index);
    yield rules.LOCAL.checkCertificationUnicity(block, conf, index);
    yield rules.LOCAL.checkCertificationIsntForLeaverOrExcluded(block, conf, index);
    yield rules.LOCAL.checkTxVersion(block);
    yield rules.LOCAL.checkTxIssuers(block);
    yield rules.LOCAL.checkTxSources(block);
    yield rules.LOCAL.checkTxRecipients(block);
    yield rules.LOCAL.checkTxAmounts(block);
    yield rules.LOCAL.checkTxSignature(block);
  }),

  ALL_LOCAL_BUT_POW_AND_SIGNATURE: (block, conf, index) => co(function *() {
    yield rules.LOCAL.checkParameters(block);
    yield rules.LOCAL.checkInnerHash(block);
    yield rules.LOCAL.checkPreviousHash(block);
    yield rules.LOCAL.checkPreviousIssuer(block);
    yield rules.LOCAL.checkUnitBase(block);
    yield rules.LOCAL.checkBlockTimes(block, conf);
    yield rules.LOCAL.checkIdentitiesSignature(block);
    yield rules.LOCAL.checkIdentitiesUserIDConflict(block, conf, index);
    yield rules.LOCAL.checkIdentitiesPubkeyConflict(block, conf, index);
    yield rules.LOCAL.checkIdentitiesMatchJoin(block, conf, index);
    yield rules.LOCAL.checkMembershipUnicity(block, conf, index);
    yield rules.LOCAL.checkRevokedUnicity(block, conf, index);
    yield rules.LOCAL.checkRevokedAreExcluded(block, conf, index);
    yield rules.LOCAL.checkMembershipsSignature(block);
    yield rules.LOCAL.checkPubkeyUnicity(block);
    yield rules.LOCAL.checkCertificationOneByIssuer(block, conf, index);
    yield rules.LOCAL.checkCertificationUnicity(block, conf, index);
    yield rules.LOCAL.checkCertificationIsntForLeaverOrExcluded(block, conf, index);
    yield rules.LOCAL.checkTxVersion(block);
    yield rules.LOCAL.checkTxIssuers(block);
    yield rules.LOCAL.checkTxSources(block);
    yield rules.LOCAL.checkTxRecipients(block);
    yield rules.LOCAL.checkTxAmounts(block);
    yield rules.LOCAL.checkTxSignature(block);
  })
};

rules.CHECK = {
  ASYNC: {
    ALL_LOCAL: checkLocal(rules.ALIAS.ALL_LOCAL),
    ALL_LOCAL_BUT_POW: checkLocal(rules.ALIAS.ALL_LOCAL_BUT_POW_AND_SIGNATURE)
  }
};

function checkLocal(contract) {
  return (b, conf, index, done) => {
    return co(function *() {
      try {
        const block = Block.fromJSON(b);
        yield contract(block, conf, index);
        done && done();
      } catch (err) {
        if (done) return done(err);
        throw err;
      }
    });
  };
}

module.exports = rules;
