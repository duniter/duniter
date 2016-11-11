"use strict";
var co             = require('co');
var should         = require('should');
var parsers        = require('../../../app/lib/streams/parsers');
var blocks         = require('../../data/blocks');
var rules          = require('../../../app/lib/rules');
var parser         = parsers.parseBlock;
var Block          = require('../../../app/lib/entity/block');
var Configuration  = require('../../../app/lib/entity/configuration');

var conf = Configuration.statics.complete({
  sigQty: 1,
  powZeroMin: 1,
  powPeriod: 18,
  incDateMin: 10,
  avgGenTime: 60,
  medianTimeBlocks: 20,
  dt: 100,
  ud0: 100,
  c: 0.1
});

describe("Block local coherence", function(){

  it('a valid block should be well formatted',                                                        test(rules.ALIAS.ALL_LOCAL_BUT_POW_AND_SIGNATURE, blocks.VALID_ROOT));

  describe("should be rejected", function(){

    it('if wrong signature block',                                                                    test(rules.LOCAL.checkBlockSignature, blocks.WRONG_SIGNATURE, 'Block\'s signature must match'));
    it('if block is V5 before it is time for V5',                                                     test(rules.LOCAL.checkVersion, blocks.V5_BLOCK_TOO_EARLY, 'V5 block cannot have medianTime < 1478696400'));
    it('if root block does not have Parameters',                                                      test(rules.LOCAL.checkParameters, blocks.ROOT_WITHOUT_PARAMETERS, 'Parameters must be provided for root block'));
    it('if proof-of-work does not match PoWMin field',                                                test(rules.LOCAL.checkProofOfWork, blocks.WRONG_PROOF_OF_WORK, 'Not a proof-of-work'));
    it('if non-root has Parameters',                                                                  test(rules.LOCAL.checkParameters, blocks.NON_ROOT_WITH_PARAMETERS, 'Parameters must not be provided for non-root block'));
    it('if root block has PreviousHash',                                                              test(rules.LOCAL.checkPreviousHash, blocks.ROOT_WITH_PREVIOUS_HASH, 'PreviousHash must not be provided for root block'));
    it('if root block has PreviousIssuer',                                                            test(rules.LOCAL.checkPreviousIssuer, blocks.ROOT_WITH_PREVIOUS_ISSUER, 'PreviousIssuer must not be provided for root block'));
    it('if non-root block does not have PreviousHash',                                                test(rules.LOCAL.checkPreviousHash, blocks.NON_ROOT_WITHOUT_PREVIOUS_HASH, 'PreviousHash must be provided for non-root block'));
    it('if non-root block does not have PreviousIssuer',                                              test(rules.LOCAL.checkPreviousIssuer, blocks.NON_ROOT_WITHOUT_PREVIOUS_ISSUER, 'PreviousIssuer must be provided for non-root block'));
    it('a V2 block with Dividend must have UnitBase field',                                           test(rules.LOCAL.checkUnitBase, blocks.UD_BLOCK_WIHTOUT_BASE, 'Document has unkown fields or wrong line ending format'));
    it('a V3 root block must have UnitBase field',                                                    test(rules.LOCAL.checkUnitBase, blocks.V3_ROOT_BLOCK_NOBASE, 'Document has unkown fields or wrong line ending format'));
    it('a V3 root block must have UnitBase field equal 0',                                            test(rules.LOCAL.checkUnitBase, blocks.V3_ROOT_BLOCK_POSITIVE_BASE, 'UnitBase must equal 0 for root block'));
    it('a block with wrong date (in past)',                                                           test(rules.LOCAL.checkBlockTimes, blocks.WRONG_DATE_LOWER, 'A block must have its Time between MedianTime and MedianTime + 1440'));
    it('a block with wrong date (in future, but too far)',                                            test(rules.LOCAL.checkBlockTimes, blocks.WRONG_DATE_HIGHER_BUT_TOO_HIGH, 'A block must have its Time between MedianTime and MedianTime + 1440'));
    it('a root block with different time & medianTime should fail',                                   test(rules.LOCAL.checkBlockTimes, blocks.WRONG_ROOT_TIMES, 'Root block must have Time equal MedianTime'));
    it('a block with good date',                                                                      test(rules.LOCAL.checkBlockTimes, blocks.GOOD_DATE_HIGHER));
    it('Block cannot contain wrongly signed identities',                                              test(rules.LOCAL.checkIdentitiesSignature, blocks.WRONGLY_SIGNED_IDENTITIES, 'Identity\'s signature must match'));
    it('block with colliding uids in identities',                                                     test(rules.LOCAL.checkIdentitiesUserIDConflict, blocks.COLLIDING_UIDS, 'Block must not contain twice same identity uid'));
    it('a block with colliding pubkeys in identities',                                                test(rules.LOCAL.checkIdentitiesPubkeyConflict, blocks.COLLIDING_PUBKEYS, 'Block must not contain twice same identity pubkey'));
    it('a block with identities not matchin joins',                                                   test(rules.LOCAL.checkIdentitiesMatchJoin, blocks.WRONG_IDTY_MATCH_JOINS, 'Each identity must match a newcomer line with same userid and certts'));
    it('Block cannot contain wrongly signed join',                                                    test(rules.LOCAL.checkMembershipsSignature, blocks.WRONGLY_SIGNED_JOIN, 'Membership\'s signature must match'));
    it('Block cannot contain wrongly signed active',                                                  test(rules.LOCAL.checkMembershipsSignature, blocks.WRONGLY_SIGNED_ACTIVE, 'Membership\'s signature must match'));
    it('Block cannot contain wrongly signed leave',                                                   test(rules.LOCAL.checkMembershipsSignature, blocks.WRONGLY_SIGNED_LEAVE, 'Membership\'s signature must match'));
    it('Block cannot contain a same pubkey more than once in joiners',                                test(rules.LOCAL.checkPubkeyUnicity, blocks.MULTIPLE_JOINERS, 'Block cannot contain a same pubkey more than once in joiners, actives, leavers and excluded'));
    it('Block cannot contain a same pubkey more than once in actives',                                test(rules.LOCAL.checkPubkeyUnicity, blocks.MULTIPLE_ACTIVES, 'Block cannot contain a same pubkey more than once in joiners, actives, leavers and excluded'));
    it('Block cannot contain a same pubkey more than once in leavers',                                test(rules.LOCAL.checkPubkeyUnicity, blocks.MULTIPLE_LEAVES, 'Block cannot contain a same pubkey more than once in joiners, actives, leavers and excluded'));
    it('Block cannot contain a same pubkey more than once in excluded',                               test(rules.LOCAL.checkPubkeyUnicity, blocks.MULTIPLE_EXCLUDED, 'Block cannot contain a same pubkey more than once in joiners, actives, leavers and excluded'));
    it('Block cannot contain a same pubkey more than once in joiners, actives, leavers and excluded', test(rules.LOCAL.checkPubkeyUnicity, blocks.MULTIPLE_OVER_ALL, 'Block cannot contain a same pubkey more than once in joiners, actives, leavers and excluded'));
    it('Block cannot have revoked key in joiners,actives,leavers',                                    test(rules.LOCAL.checkRevokedNotInMemberships, blocks.REVOKED_WITH_MEMBERSHIPS, 'A revoked pubkey cannot have a membership in the same block'));
    it('Block cannot have revoked key duplicates',                                                    test(rules.LOCAL.checkRevokedUnicity, blocks.REVOKED_WITH_DUPLICATES, 'A single revocation per member is allowed'));
    it('Block revoked keys must be in excluded',                                                      test(rules.LOCAL.checkRevokedAreExcluded, blocks.REVOKED_NOT_IN_EXCLUDED, 'A revoked member must be excluded'));
    it('Block cannot contain 2 certifications from same issuer',                                      test(rules.LOCAL.checkCertificationOneByIssuer, blocks.MULTIPLE_CERTIFICATIONS_FROM_SAME_ISSUER, 'Block cannot contain two certifications from same issuer'));
    it('Block cannot contain identical certifications',                                               test(rules.LOCAL.checkCertificationUnicity, blocks.IDENTICAL_CERTIFICATIONS, 'Block cannot contain identical certifications (A -> B)'));
    it('Block cannot contain certifications concerning a leaver',                                     test(rules.LOCAL.checkCertificationIsntForLeaverOrExcluded, blocks.LEAVER_WITH_CERTIFICATIONS, 'Block cannot contain certifications concerning leavers or excluded members'));
    it('Block cannot contain certifications concerning an excluded member',                           test(rules.LOCAL.checkCertificationIsntForLeaverOrExcluded, blocks.EXCLUDED_WITH_CERTIFICATIONS, 'Block cannot contain certifications concerning leavers or excluded members'));
    it('Block cannot contain transactions with version different of its block',                       test(rules.LOCAL.checkTxVersion, blocks.TRANSACTION_WITH_WRONG_VERSION, 'A transaction must have the same version as its block prior to protocol 0.4'));
    it('Block cannot contain transactions without issuers (1)',                                       test(rules.LOCAL.checkTxIssuers, blocks.TRANSACTION_WITHOUT_ISSUERS, 'A transaction must have at least 1 issuer'));
    it('Block cannot contain transactions without issuers (2)',                                       test(rules.LOCAL.checkTxSources, blocks.TRANSACTION_WITHOUT_SOURCES, 'A transaction must have at least 1 source'));
    it('Block cannot contain transactions without issuers (3)',                                       test(rules.LOCAL.checkTxRecipients, blocks.TRANSACTION_WITHOUT_RECIPIENT, 'A transaction must have at least 1 recipient'));
    it('Block cannot contain transactions with identical sources in one transaction',                 test(rules.LOCAL.checkTxSources, blocks.TRANSACTION_WITH_DUPLICATED_SOURCE_SINGLE_TX, 'It cannot exist 2 identical sources for transactions inside a given block'));
    it('Block cannot contain transactions with identical sources in a pack of transactions',          test(rules.LOCAL.checkTxSources, blocks.TRANSACTION_WITH_DUPLICATED_SOURCE_MULTIPLE_TX, 'It cannot exist 2 identical sources for transactions inside a given block'));
    it('Block cannot contain transactions with empty output conditions',                              test(rules.LOCAL.checkTxRecipients, blocks.TRANSACTION_WITH_EMPTY_TX_CONDITIONS, 'Empty conditions are forbidden'));
    it('Block cannot contain transactions with wrong total',                                          test(rules.LOCAL.checkTxAmounts, blocks.TRANSACTION_WRONG_TOTAL, 'Transaction inputs sum must equal outputs sum'));
    it('Block cannot contain transactions with wrong base transformation',                            test(rules.LOCAL.checkTxAmounts, blocks.TRANSACTION_WRONG_TRANSFORM, 'Transaction output base amount does not equal previous base deltas'));
    it('Block cannot contain transactions with unexisting lower base in sources',                     test(rules.LOCAL.checkTxAmounts, blocks.TRANSACTION_WRONG_TRANSFORM_LOW_BASE, 'Transaction output base amount does not equal previous base deltas'));
    it('Block cannot contain transactions with more than 100 lines',                                  test(rules.LOCAL.checkTxLen, blocks.TRANSACTION_TOO_LONG, 'A transaction has a maximum size of 100 lines'));
    it('Block cannot be refused with a good V3 transaction',                                          test(rules.LOCAL.checkTxAmounts, blocks.TRANSACTION_V3_GOOD_AMOUNTS));
    it('Block cannot contain transactions with wrong signatures',                                     test(rules.LOCAL.checkTxSignature, blocks.TRANSACTION_WITH_WRONG_SIGNATURES, 'Signature from a transaction must match'));
  });
  
});


function test (rule, raw, expectedMessage) {
  return () => co(function *() {
    try {
      let obj = parser.syncWrite(raw);
      let block = new Block(obj);
      yield rule(block, conf); // conf parameter is not always used
      if (expectedMessage) {
        throw 'Test should have thrown an error';
      }
    } catch (e) {
      if (!expectedMessage) {
        console.error(e.stack || e);
      }
      if (e.uerr) {
        // This is a controlled error
        e.uerr.message.should.equal(expectedMessage);
      } else {
        e.message.should.equal(expectedMessage);
      }
    }
  });
}
