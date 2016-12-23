"use strict";
var co            = require('co');
var Q             = require('q');
var _             = require('underscore');
var async         = require('async');
var should        = require('should');
var rules         = require('../../../app/lib/rules');
var wotb          = require('../../../app/lib/wot');
var parsers       = require('../../../app/lib/streams/parsers');
var blocks        = require('../../data/blocks');
var parser        = parsers.parseBlock;
var Block         = require('../../../app/lib/entity/block');
var Identity      = require('../../../app/lib/entity/identity');

var conf = {
  currency: 'bb',
  msValidity: 365.25 * 24 * 3600, // 1 year
  sigValidity: 365.25 * 24 * 3600, // 1 year
  sigQty: 1,
  xpercent: 0.9,
  powZeroMin: 1,
  powPeriod: 18,
  incDateMin: 10,
  dt: 100,
  ud0: 100,
  c: 0.1,
  medianTimeBlocks: 200,
  percentRot: 2 / 3,
  blockRot: 300,
  dtDiffEval: 500,
  stepMax: 1
};

function getDAL(overrides) {
  return _.extend({
    wotb: wotb.memoryInstance(),
    getCurrentBlockOrNull: () => Q(null),
    getWrittenIdtyByUID: () => Q(null),
    getWrittenIdtyByPubkey: () => Q(null),
    getToBeKicked: () => Q([]),
    isLeaving: () => Q(false),
    getPreviousLinks: () => Q(null),
    getLastValidFrom: () => Q(null),
    lastUDBlock: () => Q(null),
    getBlock: () => Q(null),
    isMember: () => Q(false),
    getBlocksBetween: () => Q([]),
    lastBlockOfIssuer: () => Q(null)
  }, overrides);
}

/**
 * TODO: reimplement tests according to new convention:
 *
 *   - Name: protocol-brg<number>-<title>.js
 *   - Content: see existing tests
 */

describe.skip("Block global coherence:", function(){

  it('a valid block should not have any error', validate(blocks.VALID_ROOT, getDAL(), {
    getIssuerPersonalizedDifficulty: () => Q(1),
    getvHEAD_1: () => Q({ version : 2 })
  }, function (err) {
    should.not.exist(err);
  }));

  it('a valid (next) block should not have any error', validate(blocks.VALID_NEXT, getDAL({
    getCurrentBlockOrNull: () => Q({ number: 2, hash: '52DC8A585C5D89571C511BB83F7E7D3382F0041452064B1272E65F0B42B82D57', issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', membersCount: 3, time: 1411776000, medianTime: 1411776000 }),
    getBlock: (number) => {
      if (number == 1) {
        return Q({ time: 1411776000, powMin: 1 });
      }
      if (number == 2) {
        return Q({ number: 3, powMin: 1 });
      }
      return Q(null);
    },
    isMember: () => Q(true),
    getBlocksBetween: () => Q([{time:1411776000},{time:1411776000},{time:1411776000}])
  }), {
    getIssuerPersonalizedDifficulty: () => Q(2),
    getvHEAD_1: () => Q({ version : 2 })
  }, function (err) {
    should.not.exist(err);
  }));

  it('a block with wrong PreviousHash should fail', test(rules.GLOBAL.checkPreviousHash, blocks.WRONG_PREVIOUS_HASH, {
    getCurrentBlockOrNull: () => Q({ number: 50, hash: '4C8800825C44A22F230AFC0D140BF1930331A686899D16EBE4C58C9F34C609E8', issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', membersCount: 3 })
  }, function (err) {
    should.exist(err);
    err.message.should.equal('PreviousHash not matching hash of current block');
  }));

  it('a block with wrong PreviousIssuer should fail', test(rules.GLOBAL.checkPreviousIssuer, blocks.WRONG_PREVIOUS_ISSUER, {
    getCurrentBlockOrNull: () => Q({ number: 50, hash: '4C8800825C44A22F230AFC0D140BF1930331A686899D16EBE4C58C9F34C609E8', issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', membersCount: 3 })
  }, function (err) {
    should.exist(err);
    err.message.should.equal('PreviousIssuer not matching issuer of current block');
  }));

  it('a block with wrong DifferentIssuersCount following V2 should fail', test(rules.GLOBAL.checkDifferentIssuersCount, blocks.WRONG_DIFFERENT_ISSUERS_COUNT_FOLLOWING_V2, {
    getCurrentBlockOrNull: () => Q({ version: 2 }),
    getBlocksBetween: () => Q([])
  }, function (err) {
    should.exist(err);
    err.message.should.equal('DifferentIssuersCount is not correct');
  }));
  
  it('a block with wrong DifferentIssuersCount following V3 should fail', test(rules.GLOBAL.checkDifferentIssuersCount, blocks.WRONG_DIFFERENT_ISSUERS_COUNT_FOLLOWING_V3, {
    getCurrentBlockOrNull: () => Q({ version: 3, issuersCount: 4 }),
    getBlocksBetween: () => Q([
      // 5 blocks, 4 different issuers
      { issuer: 'A' },
      { issuer: 'B' },
      { issuer: 'A' },
      { issuer: 'C' },
      { issuer: 'D' }
    ])
  }, function (err) {
    should.exist(err);
    err.message.should.equal('DifferentIssuersCount is not correct');
  }));

  it('a block with wrong IssuersFrame following V2 should fail', test(rules.GLOBAL.checkIssuersFrame, blocks.WRONG_ISSUERS_FRAME_FOLLOWING_V2, {
    getCurrentBlockOrNull: () => Q({ version: 2 })
  }, function (err) {
    should.exist(err);
    err.message.should.equal('IssuersFrame is not correct');
  }));

  it('a block with wrong IssuersFrame following V3 should fail', test(rules.GLOBAL.checkIssuersFrameVar, blocks.WRONG_ISSUERS_FRAME_FOLLOWING_V3, {
    getCurrentBlockOrNull: () => Q({ version: 3, issuersCount: 3, issuersFrame: 56, issuersFrameVar: 6 })
  }, function (err) {
    should.exist(err);
    err.message.should.equal('IssuersFrameVar is not correct');
  }));

  it('a block with wrong Issuer should fail', test(rules.GLOBAL.checkIssuerIsMember, blocks.WRONG_ISSUER, {
    isMember: () => Q(false)
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Issuer is not a member');
  }));

  it('a block with joiner for root block without root number shoud fail', test(rules.GLOBAL.checkJoiners, blocks.WRONG_JOIN_ROOT_NUMBER, {
    getCurrentBlockOrNull: () => Q(null)
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Number must be 0 for root block\'s memberships');
  }));

  it('a block with joiner for root block without root hash shoud fail', test(rules.GLOBAL.checkJoiners, blocks.WRONG_JOIN_ROOT_HASH, {
    getCurrentBlockOrNull: () => Q(null)
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Hash must be E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855 for root block\'s memberships');
  }));

  it('a block with joiner targeting unexisting block fail', test(rules.GLOBAL.checkJoiners, blocks.WRONG_JOIN_BLOCK_TARGET, {
    getCurrentBlockOrNull: () => Q(null)
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Membership based on an unexisting block');
  }));

  it('a block with joiner membership number lower or equal than previous should fail', test(rules.GLOBAL.checkJoiners, blocks.WRONG_JOIN_NUMBER_TOO_LOW, {
    getCurrentBlockOrNull: () => Q(null),
    getWrittenIdtyByPubkey: () => Q({ currentMSN: 2 }),
    getBlockByNumberAndHash: () => Q({ number: 3, powMin: 1 })
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Membership\'s number must be greater than last membership of the pubkey');
  }));

  it('a block with joiner membership of a yet member should fail', test(rules.GLOBAL.checkJoiners, blocks.WRONG_JOIN_ALREADY_MEMBER, {
    isMember: () => Q(true),
    getWrittenIdtyByPubkey: () => Q({ currentMSN: 2, member: true }),
    getBlockByNumberAndHash: () => Q({ number: 3, powMin: 1 }),
    getCurrentBlockOrNull: () => Q({ number: 50, hash: '4C8800825C44A22F230AFC0D140BF1930331A686899D16EBE4C58C9F34C609E8', issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', membersCount: 3 })
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Cannot be in joiners if already a member');
  }));

  it('a block with at least one revoked joiner should fail', test(rules.GLOBAL.checkJoinersAreNotRevoked, blocks.REVOKED_JOINER, {
    getWrittenIdtyByPubkey: () => Q({ currentMSN: 2, revoked: true })
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Revoked pubkeys cannot join');
  }));

  it('a block with at least one joiner without enough certifications should fail', test(rules.GLOBAL.checkJoinersHaveEnoughCertifications, blocks.NOT_ENOUGH_CERTIFICATIONS_JOINER, {
    getValidLinksTo: () => Q([])
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Joiner/Active does not gathers enough certifications');
  }));

  it('a block with at least one joiner without enough certifications should succeed', test(rules.GLOBAL.checkJoinersHaveEnoughCertifications, blocks.NOT_ENOUGH_CERTIFICATIONS_JOINER_BLOCK_0, {
  }, function (err) {
    should.not.exist(err);
  }));

  it('a block with expired membership should fail', test(rules.GLOBAL.checkJoiners, blocks.EXPIRED_MEMBERSHIP, {
    getWrittenIdtyByPubkey: () => Q({ currentMSN: 2 }),
    getBlockByNumberAndHash: () => Q({ medianTime: 1411775000, powMin: 1 }),
    getCurrentBlockOrNull: () => Q({ time: 1443333600, medianTime: 1443333600 })
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Membership has expired');
  }));

  it('a block with at least one joiner outdistanced from WoT should fail', test(rules.GLOBAL.checkJoinersAreNotOudistanced, blocks.OUTDISTANCED_JOINER, {
    wotb: {
      addNode: () => 1,
      setEnabled: () => 1,
      addLink: () => 1,
      removeLink: () => 1,
      removeNode: () => 1,
      isOutdistanced: () => true
    },
    getCurrentBlockOrNull: () => Q({ number: 2, hash: '52DC8A585C5D89571C511BB83F7E7D3382F0041452064B1272E65F0B42B82D57', issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', membersCount: 3, time: 1411776000, medianTime: 1411776000 }),
    getWrittenIdtyByPubkey: () => Q({ wotb_id: 0 })
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Joiner/Active is outdistanced from WoT');
  }));

  it('a block with active targeting unexisting block fail', test(rules.GLOBAL.checkActives, blocks.WRONG_ACTIVE_BLOCK_TARGET, {
    getCurrentBlockOrNull: () => Q(null)
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Membership based on an unexisting block');
  }));

  it('a block with certification of unknown pubkey should fail', test(rules.GLOBAL.checkCertificationsAreValid, blocks.WRONGLY_SIGNED_CERTIFICATION, {
    getCurrentBlockOrNull: () => Q(null),
    getBlock: () => Q({}),
    getBlockByNumberAndHash: () => Q({})
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Wrong signature for certification');
  }));

  it('a block with certification to non-zero block for root block should fail', test(rules.GLOBAL.checkCertificationsAreValid, blocks.CERT_BASED_ON_NON_ZERO_FOR_ROOT, {
    getCurrentBlockOrNull: () => Q(null)
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Number must be 0 for root block\'s certifications');
  }));

  it('a block with certification to unknown block should fail', test(rules.GLOBAL.checkCertificationsAreValid, blocks.CERT_BASED_ON_NON_EXISTING_BLOCK, {
    getCurrentBlockOrNull: () => Q(null)
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Certification based on an unexisting block');
  }));

  it('a block with expired certifications should fail', test(rules.GLOBAL.checkCertificationsAreValid, blocks.EXPIRED_CERTIFICATIONS, {
    getCurrentBlockOrNull: () => Q({ time: 1443333600, medianTime: 1443333600 }),
    getBlock: () => Q({ medianTime: 1411775000, powMin: 1 })
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Certification has expired');
  }));

  it('a block with certification from non-member pubkey should fail', test(rules.GLOBAL.checkCertificationsAreMadeByMembers, blocks.UNKNOWN_CERTIFIER, {
    getCurrentBlockOrNull: () => Q(null)
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Certification from non-member');
  }));

  it('a block with certification to non-member pubkey should fail', test(rules.GLOBAL.checkCertificationsAreMadeToMembers, blocks.UNKNOWN_CERTIFIED, {
    isMember: () => Q(false)
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Certification to non-member');
  }));

  it('a block with already used UserID should fail', test(rules.GLOBAL.checkIdentityUnicity, blocks.EXISTING_UID, {
    getWrittenIdtyByUID: () => Q({})
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Identity already used');
  }));

  it('a block with already used pubkey should fail', test(rules.GLOBAL.checkPubkeyUnicity, blocks.EXISTING_PUBKEY, {
    getWrittenIdtyByPubkey: () => Q({})
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Pubkey already used');
  }));

  it('a block with too early certification replay should fail', test(rules.GLOBAL.checkCertificationsDelayIsRespected, blocks.TOO_EARLY_CERTIFICATION_REPLAY, {
    getPreviousLinks: (from, to) => {
      if (from == 'G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU'
        && to == 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC') {
        // Exactly 1 second remaining
        return Q({ timestamp: '1380218401' });
      }
      return Q(null);
    }
  }, function (err) {
    should.exist(err);
    err.message.should.equal('A similar certification is already active');
  }));

  it('a block with kicked members not written under Excluded field should fail', test(rules.GLOBAL.checkKickedMembersAreExcluded, blocks.KICKED_NOT_EXCLUDED, {
    getToBeKicked: () => Q([{}])
  }, function (err) {
    should.exist(err);
    err.message.should.equal('All kicked members must be present under Excluded members');
  }));

  it('a block with kicked members well written under Excluded field should succeed', test(rules.GLOBAL.checkKickedMembersAreExcluded, blocks.KICKED_EXCLUDED, {
    getToBeKicked: () => Q([
      { pubkey: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd' },
      { pubkey: 'G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU' }
    ])
  }, function (err) {
    should.not.exist(err);
  }));
  it('a block with kicked members not well written under Excluded field should fail', test(rules.GLOBAL.checkKickedMembersAreExcluded, blocks.KICKED_EXCLUDED, {
    getToBeKicked: () => Q([
      { pubkey: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd' },
      { pubkey: 'G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU' },
      { pubkey: 'D2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU' }
    ])
  }, function (err) {
    should.exist(err);
    err.message.should.equal('All kicked members must be present under Excluded members');
  }));

  it('a block with wrong members count should fail', test(rules.GLOBAL.checkMembersCountIsGood, blocks.WRONG_MEMBERS_COUNT, {
    getCurrentBlockOrNull: () => Q(null)
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Wrong members count');
  }));

  it('a block not starting with a leading zero should fail', test(rules.GLOBAL.checkProofOfWork, blocks.NO_LEADING_ZERO, {
    bcContext: {
      getIssuerPersonalizedDifficulty: () => Q(8)
    }
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Wrong proof-of-work level: given 0 zeros and \'F\', required was 0 zeros and an hexa char between [0-7]');
  }));

  it('a block requiring 2 leading zeros but providing less should fail', test(rules.GLOBAL.checkProofOfWork, blocks.REQUIRES_7_LEADING_ZEROS, {
    bcContext: {
      getIssuerPersonalizedDifficulty: () => Q(12)
    }
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Wrong proof-of-work level: given 0 zeros and \'B\', required was 0 zeros and an hexa char between [0-3]');
  }));

  it('a block requiring 1 leading zeros but providing less should fail', test(rules.GLOBAL.checkProofOfWork, blocks.REQUIRES_6_LEADING_ZEROS, {
    bcContext: {
      getIssuerPersonalizedDifficulty: () => Q(8)
    }
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Wrong proof-of-work level: given 0 zeros and \'8\', required was 0 zeros and an hexa char between [0-7]');
  }));

  it('a block requiring 1 leading zeros as first block of newcomer should succeed', test(rules.GLOBAL.checkProofOfWork, blocks.FIRST_BLOCK_OF_NEWCOMER, {
    bcContext: {
      getIssuerPersonalizedDifficulty: () => Q(1)
    }
  }, function (err) {
    should.not.exist(err);
  }));

  it('a block requiring 40 leading zeros as second block of newcomer should fail', test(rules.GLOBAL.checkProofOfWork, blocks.SECOND_BLOCK_OF_NEWCOMER, {
    bcContext: {
      getIssuerPersonalizedDifficulty: () => Q(160)
    }
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Wrong proof-of-work level: given 0 zeros and \'F\', required was 10 zeros and an hexa char between [0-9A-F]');
  }));

  it('a root block should not fail for time reason', test(rules.GLOBAL.checkTimes, blocks.WRONG_ROOT_DATES, {
    getCurrentBlockOrNull: () => Q(null)
  }, function (err) {
    should.not.exist(err);
  }));

  it('a block with wrong median for an odd number of blocks should fail', test(rules.GLOBAL.checkTimes, blocks.WRONG_MEDIAN_TIME_ODD, {
    getBlocksBetween: () => Q([{time: 1},{time: 12}])
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Wrong MedianTime');
  }));

  it('a block with wrong median for an even number of blocks should fail', test(rules.GLOBAL.checkTimes, blocks.WRONG_MEDIAN_TIME_EVEN, {
    getBlocksBetween: () => Q([{time: 1},{time: 12}])
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Wrong MedianTime');
  }));

  it('a block whose median time is correct (odd) should pass', test(rules.GLOBAL.checkTimes, blocks.GOOD_MEDIAN_TIME_ODD, {
    getBlocksBetween: () => {
      let times = [];
      for (let i = 0; i < 103; i++)
        times.push({ time: 161 });
      return Q(times);
    }
  }, function (err) {
    should.not.exist(err);
  }));

  it('a block whose median time is correct (even) should pass', test(rules.GLOBAL.checkTimes, blocks.GOOD_MEDIAN_TIME_EVEN, {
    getBlocksBetween: () => {
      let times = [];
      for (let i = 0; i < 104; i++)
        times.push({ time: 162 });
      return Q(times);
    }
  }, function (err) {
    should.not.exist(err);
  }));

  it('a root block with Universal Dividend should fail', test(rules.GLOBAL.checkUD, blocks.ROOT_BLOCK_WITH_UD, {
    lastUDBlock: () => Q(null),
    getBlock: () => Q(null),
    getCurrentBlockOrNull: () => Q(null)
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Root block cannot have UniversalDividend field');
  }));

  it('first block with Universal Dividend should not happen before root time + dt', test(rules.GLOBAL.checkUD, blocks.FIRST_UD_BLOCK_WITH_UD_THAT_SHOULDNT, {
    lastUDBlock: () => Q(null),
    getBlock: () => Q({ hash: 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855', medianTime: 1411773000, powMin: 1 }),
    getCurrentBlockOrNull: () => Q({ number: 19, time: 1411773000, medianTime: 1411773000 })
  }, function (err) {
    should.exist(err);
    err.message.should.equal('This block cannot have UniversalDividend');
  }));

  it('first block with Universal Dividend should happen on root time + dt', test(rules.GLOBAL.checkUD, blocks.FIRST_UD_BLOCK_WITH_UD_THAT_SHOULD, {
    lastUDBlock: () => Q(null),
    getBlock: () => Q({ hash: 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855', medianTime: 1411773000, powMin: 1 }),
    getCurrentBlockOrNull: () => Q({ number: 19, time: 1411773000, medianTime: 1411773000 })
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Block must have a UniversalDividend field');
  }));

  it('a block without Universal Dividend whereas it have to have one should fail', test(rules.GLOBAL.checkUD, blocks.UD_BLOCK_WIHTOUT_UD, {
    lastUDBlock: () => Q(null),
    getBlock: () => Q({ hash: 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855', medianTime: 1411773000, powMin: 1 }),
    getCurrentBlockOrNull: () => Q({ number: 19, time: 1411773000, medianTime: 1411773000 })
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Block must have a UniversalDividend field');
  }));

  it('a block with wrong (version 2) Universal Dividend value should fail', test(rules.GLOBAL.checkUD, blocks.BLOCK_WITH_WRONG_UD, {
    lastUDBlock: () => Q({ UDTime: 1411776900, medianTime: 1411776900, monetaryMass: 3620 * 10000, dividend: 110, unitbase: 4 }),
    getBlock: () => Q(),
    getCurrentBlockOrNull: () => Q({ time: 1411777000, medianTime: 1411777000 })
  }, function (err) {
    should.exist(err);
    err.message.should.equal('UniversalDividend must be equal to 121');
  }));

  it('a block with wrong (version 3) Universal Dividend value should fail', test(rules.GLOBAL.checkUD, blocks.BLOCK_WITH_WRONG_UD_V3, {
    lastUDBlock: () => Q({ UDTime: 1411776900, medianTime: 1411776900, dividend: 110, unitbase: 4 }),
    getBlock: () => Q(),
    getCurrentBlockOrNull: () => Q({ time: 1411777000, medianTime: 1411777000 })
  }, function (err) {
    should.exist(err);
    err.message.should.equal('UniversalDividend must be equal to 121');
  }));

  it('a block with wrong UnitBase value should fail', test(rules.GLOBAL.checkUD, blocks.BLOCK_WITH_WRONG_UNIT_BASE, {
    lastUDBlock: () => Q({ UDTime: 1411777000, medianTime: 1411777000, monetaryMass: 12345678900, dividend: 100, unitbase: 2 }),
    getBlock: () => Q(),
    getCurrentBlockOrNull: () => Q({ time: 1411777000, medianTime: 1411777000 })
  }, function (err) {
    should.exist(err);
    err.message.should.equal('UnitBase must be equal to 3');
  }));

  it('a block without UD with wrong UnitBase value should fail', test(rules.GLOBAL.checkUD, blocks.BLOCK_WITH_WRONG_UNIT_BASE_NO_UD, {
    lastUDBlock: () => Q({ UDTime: 1411777000, medianTime: 1411777000, monetaryMass: 12345678900, dividend: 100, unitbase: 8 }),
    getBlock: () => Q(),
    getCurrentBlockOrNull: () => Q({ time: 1411777000, medianTime: 1411777000, unitbase: 5 })
  }, function (err) {
    should.exist(err);
    err.message.should.equal('UnitBase must be equal to previous unit base = 5');
  }));

  it('a root block with unlegitimated Universal Dividend presence should fail', test(rules.GLOBAL.checkUD, blocks.BLOCK_UNLEGITIMATE_UD, {
    lastUDBlock: () => Q({ UDTime: 1411777000, medianTime: 1411777000, monetaryMass: 3620 * 10000, dividend: 110, unitbase: 4 }),
    getBlock: () => Q(),
    getCurrentBlockOrNull: () => Q({ time: 1411777000, medianTime: 1411777000 })
  }, function (err) {
    should.exist(err);
    err.message.should.equal('This block cannot have UniversalDividend');
  }));

  it('a root block with unlegitimated Universal Dividend presence should fail', test(rules.GLOBAL.checkUD, blocks.BLOCK_UNLEGITIMATE_UD_2, {
    lastUDBlock: () => Q({ UDTime: 1411777000, medianTime: 1411777000, monetaryMass: 3620 * 10000, dividend: 110, unitbase: 4 }),
    getBlock: () => Q(),
    getCurrentBlockOrNull: () => Q({ time: 1411777000, medianTime: 1411777000 })
  }, function (err) {
    should.exist(err);
    err.message.should.equal('This block cannot have UniversalDividend');
  }));


  it('a block without transactions should pass', test(rules.GLOBAL.checkSourcesAvailability, blocks.BLOCK_WITHOUT_TRANSACTIONS, {
    getCurrentBlockOrNull: () => Q(null)
  }, function (err) {
    should.not.exist(err);
  }));

  it('a block with good transactions should pass', test(rules.GLOBAL.checkSourcesAvailability, blocks.BLOCK_WITH_GOOD_TRANSACTIONS, {
    getCurrentBlockOrNull: () => Q({ unitbase: 5 }),
    getSource: (id, noffset) => {
      if (id == '6991C993631BED4733972ED7538E41CCC33660F554E3C51963E2A0AC4D6453D3' && noffset == 4)   return Q({ amount: 0,   base: 4 });
      if (id == '3A09A20E9014110FD224889F13357BAB4EC78A72F95CA03394D8CCA2936A7435' && noffset == 10)  return Q({ amount: 0,   base: 3 });
      if (id == 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd' && noffset == 46)                      return Q({ amount: 0,   base: 4 });
      if (id == 'A0D9B4CDC113ECE1145C5525873821398890AE842F4B318BD076095A23E70956' && noffset == 66)  return Q({ amount: 235, base: 4 });
      if (id == '67F2045B5318777CC52CD38B424F3E40DDA823FA0364625F124BABE0030E7B5B' && noffset == 176) return Q({ amount: 0,   base: 4 });
      return Q(null);
    }
  }, function (err) {
    should.not.exist(err);
  }));

  it('a block with wrong transaction sum should fail', test(rules.GLOBAL.checkSourcesAvailability, blocks.BLOCK_WITH_WRONG_TRANSACTION_SUMS, {
    getCurrentBlockOrNull: () => Q({ unitbase: 5 }),
    getSource: (id, noffset) => {
      if (id == '6991C993631BED4733972ED7538E41CCC33660F554E3C51963E2A0AC4D6453D3' && noffset == 4)   return Q({ amount: 0,   base: 4 });
      if (id == '3A09A20E9014110FD224889F13357BAB4EC78A72F95CA03394D8CCA2936A7435' && noffset == 10)  return Q({ amount: 0,   base: 3 });
      if (id == 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd' && noffset == 46)                      return Q({ amount: 0,   base: 4 });
      if (id == 'A0D9B4CDC113ECE1145C5525873821398890AE842F4B318BD076095A23E70956' && noffset == 66)  return Q({ amount: 235, base: 4 });
      if (id == '67F2045B5318777CC52CD38B424F3E40DDA823FA0364625F124BABE0030E7B5B' && noffset == 176) return Q({ amount: 0,   base: 4 });
      return Q(null);
    }
  }, function (err) {
    should.exist(err);
    err.uerr.message.should.equal('Sum of inputs must equal sum of outputs');
  }));

  it('a block with wrong transaction unit bases should fail', test(rules.GLOBAL.checkSourcesAvailability, blocks.BLOCK_WITH_WRONG_TRANSACTION_SUMS, {
    getCurrentBlockOrNull: () => Q({ unitbase: 5 }),
    getSource: (id, noffset) => {
      if (id == '6991C993631BED4733972ED7538E41CCC33660F554E3C51963E2A0AC4D6453D3' && noffset == 4)   return Q({ amount: 0,   base: 4 });
      if (id == '3A09A20E9014110FD224889F13357BAB4EC78A72F95CA03394D8CCA2936A7435' && noffset == 10)  return Q({ amount: 0,   base: 3 });
      if (id == 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd' && noffset == 46)                      return Q({ amount: 0,   base: 4 });
      if (id == 'A0D9B4CDC113ECE1145C5525873821398890AE842F4B318BD076095A23E70956' && noffset == 66)  return Q({ amount: 235, base: 4 });
      if (id == '67F2045B5318777CC52CD38B424F3E40DDA823FA0364625F124BABE0030E7B5B' && noffset == 176) return Q({ amount: 0,   base: 4 });
      return Q(null);
    }
  }, function (err) {
    should.exist(err);
    err.uerr.message.should.equal('Sum of inputs must equal sum of outputs');
  }));

  it('a block with whose transaction has too high unit bases should fail', test(rules.GLOBAL.checkSourcesAvailability, blocks.BLOCK_WITH_WRONG_TRANSACTION_UNIT_BASES, {
    getCurrentBlockOrNull: () => Q({ unitbase: 2 }),
    getSource: (id, noffset) => {
      if (id == '6991C993631BED4733972ED7538E41CCC33660F554E3C51963E2A0AC4D6453D3' && noffset == 4)   return Q({ amount: 0,   base: 4 });
      if (id == '3A09A20E9014110FD224889F13357BAB4EC78A72F95CA03394D8CCA2936A7435' && noffset == 10)  return Q({ amount: 0,   base: 3 });
      if (id == 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd' && noffset == 46)                      return Q({ amount: 0,   base: 4 });
      if (id == 'A0D9B4CDC113ECE1145C5525873821398890AE842F4B318BD076095A23E70956' && noffset == 66)  return Q({ amount: 235, base: 4 });
      if (id == '67F2045B5318777CC52CD38B424F3E40DDA823FA0364625F124BABE0030E7B5B' && noffset == 176) return Q({ amount: 0,   base: 4 });
      return Q(null);
    }
  }, function (err) {
    should.exist(err);
    err.uerr.message.should.equal('Wrong unit base for outputs');
  }));

  it('a block with unavailable UD source should fail', test(rules.GLOBAL.checkSourcesAvailability, blocks.BLOCK_WITH_UNAVAILABLE_UD_SOURCE, {
    getCurrentBlockOrNull: () => Q({ unitbase: 5 }),
    getSource: (id, noffset) => {
      if (id == '6991C993631BED4733972ED7538E41CCC33660F554E3C51963E2A0AC4D6453D3' && noffset == 4)   return Q({ amount: 0,   base: 4 });
      if (id == '3A09A20E9014110FD224889F13357BAB4EC78A72F95CA03394D8CCA2936A7435' && noffset == 10)  return Q({ amount: 0,   base: 3 });
      if (id == 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd' && noffset == 46)                      return Q({ amount: 0,   base: 4 });
      if (id == 'A0D9B4CDC113ECE1145C5525873821398890AE842F4B318BD076095A23E70956' && noffset == 66)  return Q({ amount: 235, base: 4 });
      if (id == '67F2045B5318777CC52CD38B424F3E40DDA823FA0364625F124BABE0030E7B5B' && noffset == 176) return Q({ amount: 0,   base: 4 });
      return Q(null);
    }
  }, function (err) {
    should.exist(err);
    err.should.have.property('uerr').property('message').equal('Source already consumed');
  }));

  it('a block with unavailable TX source should fail', test(rules.GLOBAL.checkSourcesAvailability, blocks.BLOCK_WITH_UNAVAILABLE_TX_SOURCE, {
    getCurrentBlockOrNull: () => Q({ unitbase: 5 }),
    getSource: (id, noffset) => {
      if (id == '6991C993631BED4733972ED7538E41CCC33660F554E3C51963E2A0AC4D6453D3' && noffset == 4)   return Q({ amount: 0,   base: 4 });
      if (id == '3A09A20E9014110FD224889F13357BAB4EC78A72F95CA03394D8CCA2936A7435' && noffset == 10)  return Q({ amount: 0,   base: 3 });
      if (id == 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd' && noffset == 46)                      return Q({ amount: 0,   base: 4 });
      if (id == 'A0D9B4CDC113ECE1145C5525873821398890AE842F4B318BD076095A23E70956' && noffset == 66)  return Q({ amount: 235, base: 4 });
      if (id == '67F2045B5318777CC52CD38B424F3E40DDA823FA0364625F124BABE0030E7B5B' && noffset == 176) return Q({ amount: 0,   base: 4 });
      return Q(null);
    }
  }, function (err) {
    should.exist(err);
    err.should.have.property('uerr').property('message').equal('Source already consumed');
  }));

  it('a block with a too high unit base should fail', test(rules.GLOBAL.checkSourcesAvailability, blocks.BLOCK_TX_V3_TOO_HIGH_OUTPUT_BASE, {
    getCurrentBlockOrNull: () => Q({ unitbase: 3 }),
    getSource: () => Q({ base: 1, amount: 10 })
  }, function (err) {
    should.exist(err);
    err.should.have.property('uerr').property('message').equal('Wrong unit base for outputs');
  }));

  it('a block with an unknown member revoked should fail', test(rules.GLOBAL.checkRevoked, blocks.BLOCK_UNKNOWN_REVOKED, {
    getWrittenIdtyByPubkey: () => Q(null)
  }, function (err) {
    should.exist(err);
    err.message.should.equal('A pubkey who was never a member cannot be revoked');
  }));

  it('a block with a yet revoked identity should fail', test(rules.GLOBAL.checkRevoked, blocks.BLOCK_WITH_YET_REVOKED, {
    getWrittenIdtyByPubkey: () => Q({ revoked: true })
  }, function (err) {
    should.exist(err);
    err.message.should.equal('A revoked identity cannot be revoked again');
  }));

  it('a block with a wrong revocation signature should fail', test(rules.GLOBAL.checkRevoked, blocks.BLOCK_WITH_WRONG_REVOCATION_SIG, {
    getWrittenIdtyByPubkey: () => Q({})
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Revocation signature must match');
  }));
});

function test (rule, raw, dal, callback) {
  return function() {
    return co(function *() {
      let obj = parser.syncWrite(raw);
      let block = new Block(obj);
      if (rule == rules.GLOBAL.checkProofOfWork || rule == rules.GLOBAL.checkVersion) {
        yield rule(block, dal.bcContext);
      } else if (rule.length == 2) {
        yield rule(block, dal);
      } else {
        yield rule(block, conf, dal);
      }
    })
      .then(callback).catch(callback);
  };
}

function validate (raw, dal, bcContext, callback) {
  var block;
  return function() {
    return Q.Promise(function(resolve, reject){
      async.waterfall([
        function (next){
          block = new Block(parser.syncWrite(raw));
          rules.CHECK.ASYNC.ALL_GLOBAL(block, conf, dal, bcContext, next);
        }
      ], function (err) {
        err && console.error(err.stack);
        err ? reject(err) : resolve();
      });
    })
      .then(callback).catch(callback);
  };
}
