"use strict";

var _ = require('underscore');
var co          = require('co');
var local_rules = require('./local_rules');
var global_rules = require('./global_rules');

let rules = {};

rules.LOCAL = local_rules.FUNCTIONS;
rules.GLOBAL = global_rules.FUNCTIONS;

rules.HELPERS = {};

_.extend(rules.HELPERS, local_rules.HELPERS);
_.extend(rules.HELPERS, global_rules.HELPERS);

rules.ALIAS = {

  ALL: (block, conf) => co(function *() {
    yield rules.LOCAL.checkParameters(block);
    yield rules.LOCAL.checkProofOfWork(block);
    yield rules.LOCAL.checkInnerHash(block);
    yield rules.LOCAL.checkPreviousHash(block);
    yield rules.LOCAL.checkPreviousIssuer(block);
    yield rules.LOCAL.checkUnitBase(block);
    yield rules.LOCAL.checkBlockSignature(block);
    yield rules.LOCAL.checkBlockTimes(block, conf);
    yield rules.LOCAL.checkIdentitiesSignature(block);
    yield rules.LOCAL.checkIdentitiesUserIDConflict(block);
    yield rules.LOCAL.checkIdentitiesPubkeyConflict(block);
    yield rules.LOCAL.checkIdentitiesMatchJoin(block);
    yield rules.LOCAL.checkRevokedNotInMemberships(block);
    yield rules.LOCAL.checkRevokedUnicity(block);
    yield rules.LOCAL.checkRevokedAreExcluded(block);
    yield rules.LOCAL.checkMembershipsSignature(block);
    yield rules.LOCAL.checkPubkeyUnicity(block);
    yield rules.LOCAL.checkCertificationOneByIssuer(block);
    yield rules.LOCAL.checkCertificationUnicity(block);
    yield rules.LOCAL.checkCertificationIsntForLeaverOrExcluded(block);
    yield rules.LOCAL.checkTxIssuers(block);
    yield rules.LOCAL.checkTxSources(block);
    yield rules.LOCAL.checkTxRecipients(block);
    yield rules.LOCAL.checkTxSignature(block);
  }),

  ALL_BUT_POW_AND_SIGNATURE: (block, conf) => co(function *() {
    yield rules.LOCAL.checkParameters(block);
    yield rules.LOCAL.checkInnerHash(block);
    yield rules.LOCAL.checkPreviousHash(block);
    yield rules.LOCAL.checkPreviousIssuer(block);
    yield rules.LOCAL.checkUnitBase(block);
    yield rules.LOCAL.checkBlockTimes(block, conf);
    yield rules.LOCAL.checkIdentitiesSignature(block);
    yield rules.LOCAL.checkIdentitiesUserIDConflict(block);
    yield rules.LOCAL.checkIdentitiesPubkeyConflict(block);
    yield rules.LOCAL.checkIdentitiesMatchJoin(block);
    yield rules.LOCAL.checkRevokedNotInMemberships(block);
    yield rules.LOCAL.checkRevokedUnicity(block);
    yield rules.LOCAL.checkRevokedAreExcluded(block);
    yield rules.LOCAL.checkMembershipsSignature(block);
    yield rules.LOCAL.checkPubkeyUnicity(block);
    yield rules.LOCAL.checkCertificationOneByIssuer(block);
    yield rules.LOCAL.checkCertificationUnicity(block);
    yield rules.LOCAL.checkCertificationIsntForLeaverOrExcluded(block);
    yield rules.LOCAL.checkTxIssuers(block);
    yield rules.LOCAL.checkTxSources(block);
    yield rules.LOCAL.checkTxRecipients(block);
    yield rules.LOCAL.checkTxSignature(block);
  })
};

module.exports = rules;
