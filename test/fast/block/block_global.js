"use strict";
var co            = require('co');
var Q             = require('q');
var _             = require('underscore');
var async         = require('async');
var should        = require('should');
var wotb          = require('../../../app/lib/wot');
var parsers       = require('../../../app/lib/streams/parsers/doc');
var blocks        = require('../../data/blocks');
var validator     = require('../../../app/lib/globalValidator');
var parser        = parsers.parseBlock;
var Block         = require('../../../app/lib/entity/block');
var Identity      = require('../../../app/lib/entity/identity');

var conf = {
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
    getCurrent: () => Q(null),
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

describe("Block global coherence:", function(){

  it('a valid block should not have any error', validate(blocks.VALID_ROOT, getDAL(), function (err) {
    should.not.exist(err);
  }));

  it('a valid (next) block should not have any error', validate(blocks.VALID_NEXT, getDAL({
    getCurrent: () => Q({ number: 2, hash: '52DC8A585C5D89571C511BB83F7E7D3382F0041452064B1272E65F0B42B82D57', issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', membersCount: 3, time: 1411776000, medianTime: 1411776000 }),
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
  }), function (err) {
    should.not.exist(err);
  }));

  it('a block with positive number while no root exists should fail', test('checkNumber', blocks.ROOT_BLOCK_REQUIRED, {
    getCurrent: () => Q(null)
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Root block required first');
  }));

  it('a block with same number as current should fail', test('checkNumber', blocks.SAME_BLOCK_NUMBER, {
    getCurrent: () => Q({ number: 50, hash: '4C8800825C44A22F230AFC0D140BF1930331A686899D16EBE4C58C9F34C609E8', issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', membersCount: 3 })
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Too late for this block');
  }));

  it('a block with older number than current should fail', test('checkNumber', blocks.OLD_BLOCK_NUMBER, {
    getCurrent: () => Q({ number: 50, hash: '4C8800825C44A22F230AFC0D140BF1930331A686899D16EBE4C58C9F34C609E8', issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', membersCount: 3 })
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Too late for this block');
  }));

  it('a block with too far future number than current should fail', test('checkNumber', blocks.FAR_FUTURE_BLOCK_NUMBER, {
    getCurrent: () => Q({ number: 50, hash: '4C8800825C44A22F230AFC0D140BF1930331A686899D16EBE4C58C9F34C609E8', issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', membersCount: 3 })
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Too early for this block');
  }));

  it('a block with wrong PreviousHash should fail', test('checkPreviousHash', blocks.WRONG_PREVIOUS_HASH, {
    getCurrent: () => Q({ number: 50, hash: '4C8800825C44A22F230AFC0D140BF1930331A686899D16EBE4C58C9F34C609E8', issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', membersCount: 3 })
  }, function (err) {
    should.exist(err);
    err.message.should.equal('PreviousHash not matching hash of current block');
  }));

  it('a block with wrong PreviousIssuer should fail', test('checkPreviousIssuer', blocks.WRONG_PREVIOUS_ISSUER, {
    getCurrent: () => Q({ number: 50, hash: '4C8800825C44A22F230AFC0D140BF1930331A686899D16EBE4C58C9F34C609E8', issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', membersCount: 3 })
  }, function (err) {
    should.exist(err);
    err.message.should.equal('PreviousIssuer not matching issuer of current block');
  }));

  it('a block with wrong Issuer should fail', test('checkIssuerIsMember', blocks.WRONG_ISSUER, {
    isMember: () => Q(false)
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Issuer is not a member');
  }));

  it('a block with joiner for root block without root number shoud fail', test('checkJoiners', blocks.WRONG_JOIN_ROOT_NUMBER, {
    getCurrent: () => Q(null)
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Number must be 0 for root block\'s memberships');
  }));

  it('a block with joiner for root block without root hash shoud fail', test('checkJoiners', blocks.WRONG_JOIN_ROOT_HASH, {
    getCurrent: () => Q(null)
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Hash must be E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855 for root block\'s memberships');
  }));

  it('a block with joiner targeting unexisting block fail', test('checkJoiners', blocks.WRONG_JOIN_BLOCK_TARGET, {
    getCurrent: () => Q(null)
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Membership based on an unexisting block');
  }));

  it('a block with joiner membership number lower or equal than previous should fail', test('checkJoiners', blocks.WRONG_JOIN_NUMBER_TOO_LOW, {
    getCurrent: () => Q(null),
    getWrittenIdtyByPubkey: () => Q({ currentMSN: 2 }),
    getBlockByNumberAndHash: () => Q({ number: 3, powMin: 1 })
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Membership\'s number must be greater than last membership of the pubkey');
  }));

  it('a block with joiner membership of a yet member should fail', test('checkJoiners', blocks.WRONG_JOIN_ALREADY_MEMBER, {
    isMember: () => Q(true),
    getWrittenIdtyByPubkey: () => Q({ currentMSN: 2, member: true }),
    getBlockByNumberAndHash: () => Q({ number: 3, powMin: 1 }),
    getCurrent: () => Q({ number: 50, hash: '4C8800825C44A22F230AFC0D140BF1930331A686899D16EBE4C58C9F34C609E8', issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', membersCount: 3 })
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Cannot be in joiners if already a member');
  }));

  it('a block with at least one revoked joiner should fail', test('checkJoinersAreNotRevoked', blocks.REVOKED_JOINER, {
    getWrittenIdtyByPubkey: () => Q({ currentMSN: 2, revoked: true })
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Revoked pubkeys cannot join');
  }));

  it('a block with at least one joiner without enough certifications should fail', test('checkJoinersHaveEnoughCertifications', blocks.NOT_ENOUGH_CERTIFICATIONS_JOINER, {
    getValidLinksTo: () => Q([])
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Joiner/Active does not gathers enough certifications');
  }));

  it('a block with at least one joiner without enough certifications should succeed', test('checkJoinersHaveEnoughCertifications', blocks.NOT_ENOUGH_CERTIFICATIONS_JOINER_BLOCK_0, {
  }, function (err) {
    should.not.exist(err);
  }));

  it('a block with expired membership should fail', test('checkJoiners', blocks.EXPIRED_MEMBERSHIP, {
    getWrittenIdtyByPubkey: () => Q({ currentMSN: 2 }),
    getBlockByNumberAndHash: () => Q({ medianTime: 1411775000, powMin: 1 }),
    getCurrent: () => Q({ time: 1443333600, medianTime: 1443333600 })
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Membership has expired');
  }));

  it('a block with at least one joiner outdistanced from WoT should fail', test('checkJoinersAreNotOudistanced', blocks.OUTDISTANCED_JOINER, {
    wotb: {
      addNode: () => 1,
      setEnabled: () => 1,
      addLink: () => 1,
      removeLink: () => 1,
      removeNode: () => 1,
      isOutdistanced: () => true
    },
    getCurrent: () => Q({ number: 2, hash: '52DC8A585C5D89571C511BB83F7E7D3382F0041452064B1272E65F0B42B82D57', issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', membersCount: 3, time: 1411776000, medianTime: 1411776000 }),
    getWrittenIdtyByPubkey: () => Q({ wotb_id: 0 })
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Joiner/Active is outdistanced from WoT');
  }));

  it('a block with active targeting unexisting block fail', test('checkActives', blocks.WRONG_ACTIVE_BLOCK_TARGET, {
    getCurrent: () => Q(null)
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Membership based on an unexisting block');
  }));

  it('a block with certification of unknown pubkey should fail', test('checkCertificationsAreValid', blocks.WRONGLY_SIGNED_CERTIFICATION, {
    getCurrent: () => Q(null),
    getBlock: () => Q({}),
    getBlockByNumberAndHash: () => Q({})
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Wrong signature for certification');
  }));

  it('a block with certification to non-zero block for root block should fail', test('checkCertificationsAreValid', blocks.CERT_BASED_ON_NON_ZERO_FOR_ROOT, {
    getCurrent: () => Q(null)
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Number must be 0 for root block\'s certifications');
  }));

  it('a block with certification to unknown block should fail', test('checkCertificationsAreValid', blocks.CERT_BASED_ON_NON_EXISTING_BLOCK, {
    getCurrent: () => Q(null)
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Certification based on an unexisting block');
  }));

  it('a block with expired certifications should fail', test('checkCertificationsAreValid', blocks.EXPIRED_CERTIFICATIONS, {
    getCurrent: () => Q({ time: 1443333600, medianTime: 1443333600 }),
    getBlock: () => Q({ medianTime: 1411775000, powMin: 1 })
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Certification has expired');
  }));

  it('a block with certification from non-member pubkey should fail', test('checkCertificationsAreMadeByMembers', blocks.UNKNOWN_CERTIFIER, {
    getCurrent: () => Q(null)
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Certification from non-member');
  }));

  it('a block with certification to non-member pubkey should fail', test('checkCertificationsAreMadeToMembers', blocks.UNKNOWN_CERTIFIED, {
    isMember: () => Q(false)
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Certification to non-member');
  }));

  it('a block with already used UserID should fail', test('checkIdentityUnicity', blocks.EXISTING_UID, {
    getWrittenIdtyByUID: () => Q({})
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Identity already used');
  }));

  it('a block with already used pubkey should fail', test('checkPubkeyUnicity', blocks.EXISTING_PUBKEY, {
    getWrittenIdtyByPubkey: () => Q({})
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Pubkey already used');
  }));

  it('a block with too early certification replay should fail', test('checkCertificationsDelayIsRespected', blocks.TOO_EARLY_CERTIFICATION_REPLAY, {
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

  it('a block with kicked members not written under Excluded field should fail', test('checkKickedMembersAreExcluded', blocks.KICKED_NOT_EXCLUDED, {
    getToBeKicked: () => Q([{}])
  }, function (err) {
    should.exist(err);
    err.message.should.equal('All kicked members must be present under Excluded members');
  }));

  it('a block with kicked members well written under Excluded field should succeed', test('checkKickedMembersAreExcluded', blocks.KICKED_EXCLUDED, {
    getToBeKicked: () => Q([
      { pubkey: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd' },
      { pubkey: 'G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU' }
    ])
  }, function (err) {
    should.not.exist(err);
  }));
  it('a block with kicked members not well written under Excluded field should fail', test('checkKickedMembersAreExcluded', blocks.KICKED_EXCLUDED, {
    getToBeKicked: () => Q([
      { pubkey: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd' },
      { pubkey: 'G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU' },
      { pubkey: 'D2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU' }
    ])
  }, function (err) {
    should.exist(err);
    err.message.should.equal('All kicked members must be present under Excluded members');
  }));

  it('a block with wrong members count should fail', test('checkMembersCountIsGood', blocks.WRONG_MEMBERS_COUNT, {
    getCurrent: () => Q(null)
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Wrong members count');
  }));

  it('a block not starting with a leading zero should fail', test('checkProofOfWork', blocks.NO_LEADING_ZERO, {
    getCurrent: () => Q({ number: 2 }),
    lastBlockOfIssuer: () => Q({ number: 2 }),
    getBlock: () => Q({ powMin: 1 }),
    getBlocksBetween: () => Q([{ issuer: 'a' }])
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Wrong proof-of-work level: given 0 zeros and \'F\', required was 0 zeros and an hexa char between [0-7]');
  }));

  it('a block requiring 2 leading zeros but providing less should fail', test('checkProofOfWork', blocks.REQUIRES_7_LEADING_ZEROS, {
    getCurrent: () => Q({ number: 2 }),
    lastBlockOfIssuer: () => Q({ number: 2 }),
    getBlock: () => Q({ powMin: 1 }),
    getBlocksBetween: () => Q([{ issuer: 'a' },{ issuer: 'b' }])
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Wrong proof-of-work level: given 0 zeros and \'B\', required was 0 zeros and an hexa char between [0-3]');
  }));

  it('a block requiring 1 leading zeros but providing less should fail', test('checkProofOfWork', blocks.REQUIRES_6_LEADING_ZEROS, {
    getCurrent: () => Q({ number: 2 }),
    lastBlockOfIssuer: () => Q({ number: 2 }),
    getBlock: () => Q({ powMin: 1 }),
    getBlocksBetween: () => Q([{ issuer: 'a' }])
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Wrong proof-of-work level: given 0 zeros and \'8\', required was 0 zeros and an hexa char between [0-7]');
  }));

  it('a block requiring 1 leading zeros as first block of newcomer should succeed', test('checkProofOfWork', blocks.FIRST_BLOCK_OF_NEWCOMER, {
    getCurrent: () => Q(null)
  }, function (err) {
    should.not.exist(err);
  }));

  it('a block requiring 40 leading zeros as second block of newcomer should fail', test('checkProofOfWork', blocks.SECOND_BLOCK_OF_NEWCOMER, {
    getCurrent: () => Q({ number: 2 }),
    lastBlockOfIssuer: () => Q({ number: 2 }),
    getBlock: () => Q({ powMin: 40 }),
    getBlocksBetween: () => Q([{ issuer: 'a' }])
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Wrong proof-of-work level: given 0 zeros and \'F\', required was 10 zeros and an hexa char between [0-9A-F]');
  }));

  it('a root block should not fail for time reason', test('checkTimes', blocks.WRONG_ROOT_DATES, {
    getCurrent: () => Q(null)
  }, function (err) {
    should.not.exist(err);
  }));

  it('a block with wrong median for an odd number of blocks should fail', test('checkTimes', blocks.WRONG_MEDIAN_TIME_ODD, {
    getBlocksBetween: () => Q([{time: 1},{time: 12}])
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Wrong MedianTime');
  }));

  it('a block with wrong median for an even number of blocks should fail', test('checkTimes', blocks.WRONG_MEDIAN_TIME_EVEN, {
    getBlocksBetween: () => Q([{time: 1},{time: 12}])
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Wrong MedianTime');
  }));

  it('a block whose median time is correct (odd) should pass', test('checkTimes', blocks.GOOD_MEDIAN_TIME_ODD, {
    getBlocksBetween: () => {
      let times = [];
      for (let i = 0; i < 103; i++)
        times.push({ time: 161 });
      return Q(times);
    }
  }, function (err) {
    should.not.exist(err);
  }));

  it('a block whose median time is correct (even) should pass', test('checkTimes', blocks.GOOD_MEDIAN_TIME_EVEN, {
    getBlocksBetween: () => {
      let times = [];
      for (let i = 0; i < 104; i++)
        times.push({ time: 162 });
      return Q(times);
    }
  }, function (err) {
    should.not.exist(err);
  }));

  it('a root block with Universal Dividend should fail', test('checkUD', blocks.ROOT_BLOCK_WITH_UD, {
    lastUDBlock: () => Q(null),
    getBlock: () => Q(null),
    getCurrent: () => Q(null)
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Root block cannot have UniversalDividend field');
  }));

  it('first block with Universal Dividend should not happen before root time + dt', test('checkUD', blocks.FIRST_UD_BLOCK_WITH_UD_THAT_SHOULDNT, {
    lastUDBlock: () => Q(null),
    getBlock: () => Q({ hash: 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855', medianTime: 1411773000, powMin: 1 }),
    getCurrent: () => Q({ number: 19, time: 1411773000, medianTime: 1411773000 })
  }, function (err) {
    should.exist(err);
    err.message.should.equal('This block cannot have UniversalDividend');
  }));

  it('first block with Universal Dividend should happen on root time + dt', test('checkUD', blocks.FIRST_UD_BLOCK_WITH_UD_THAT_SHOULD, {
    lastUDBlock: () => Q(null),
    getBlock: () => Q({ hash: 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855', medianTime: 1411773000, powMin: 1 }),
    getCurrent: () => Q({ number: 19, time: 1411773000, medianTime: 1411773000 })
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Block must have a UniversalDividend field');
  }));

  it('a block without Universal Dividend whereas it have to have one should fail', test('checkUD', blocks.UD_BLOCK_WIHTOUT_UD, {
    lastUDBlock: () => Q(null),
    getBlock: () => Q({ hash: 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855', medianTime: 1411773000, powMin: 1 }),
    getCurrent: () => Q({ number: 19, time: 1411773000, medianTime: 1411773000 })
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Block must have a UniversalDividend field');
  }));

  it('a block with wrong Universal Dividend value should fail', test('checkUD', blocks.BLOCK_WITH_WRONG_UD, {
    lastUDBlock: () => Q({ UDTime: 1411776900, medianTime: 1411776900, monetaryMass: 3620 * 10000, dividend: 110, unitbase: 4 }),
    getBlock: () => Q(),
    getCurrent: () => Q({ time: 1411777000, medianTime: 1411777000 })
  }, function (err) {
    should.exist(err);
    err.message.should.equal('UniversalDividend must be equal to 121');
  }));

  it('a block with wrong UnitBase value should fail', test('checkUD', blocks.BLOCK_WITH_WRONG_UNIT_BASE, {
    lastUDBlock: () => Q({ UDTime: 1411777000, medianTime: 1411777000, monetaryMass: 12345678900, dividend: 100, unitbase: 2 }),
    getBlock: () => Q(),
    getCurrent: () => Q({ time: 1411777000, medianTime: 1411777000 })
  }, function (err) {
    should.exist(err);
    err.message.should.equal('UnitBase must be equal to 3');
  }));

  it('a root block with unlegitimated Universal Dividend presence should fail', test('checkUD', blocks.BLOCK_UNLEGITIMATE_UD, {
    lastUDBlock: () => Q({ UDTime: 1411777000, medianTime: 1411777000, monetaryMass: 3620 * 10000, dividend: 110, unitbase: 4 }),
    getBlock: () => Q(),
    getCurrent: () => Q({ time: 1411777000, medianTime: 1411777000 })
  }, function (err) {
    should.exist(err);
    err.message.should.equal('This block cannot have UniversalDividend');
  }));

  it('a root block with unlegitimated Universal Dividend presence should fail', test('checkUD', blocks.BLOCK_UNLEGITIMATE_UD_2, {
    lastUDBlock: () => Q({ UDTime: 1411777000, medianTime: 1411777000, monetaryMass: 3620 * 10000, dividend: 110, unitbase: 4 }),
    getBlock: () => Q(),
    getCurrent: () => Q({ time: 1411777000, medianTime: 1411777000 })
  }, function (err) {
    should.exist(err);
    err.message.should.equal('This block cannot have UniversalDividend');
  }));


  it('a block without transactions should pass', test('checkTransactions', blocks.BLOCK_WITHOUT_TRANSACTIONS, {
    getCurrent: () => Q(null)
  }, function (err) {
    should.not.exist(err);
  }));

  it('a block with good transactions should pass', test('checkTransactions', blocks.BLOCK_WITH_GOOD_TRANSACTIONS, {
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

  it('a block with wrong transaction sum should fail', test('checkTransactions', blocks.BLOCK_WITH_WRONG_TRANSACTION_SUMS, {
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

  it('a block with wrong transaction unit bases should fail', test('checkTransactions', blocks.BLOCK_WITH_WRONG_TRANSACTION_SUMS, {
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

  it('a block with whose transaction has too high unit bases should fail', test('checkTransactions', blocks.BLOCK_WITH_WRONG_TRANSACTION_UNIT_BASES, {
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

  it('a block with unavailable UD source should fail', test('checkTransactions', blocks.BLOCK_WITH_UNAVAILABLE_UD_SOURCE, {
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

  it('a block with unavailable TX source should fail', test('checkTransactions', blocks.BLOCK_WITH_UNAVAILABLE_TX_SOURCE, {
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

  it('a block with an unknown member revoked should fail', test('checkRevoked', blocks.BLOCK_UNKNOWN_REVOKED, {
    getWrittenIdtyByPubkey: () => Q(null)
  }, function (err) {
    should.exist(err);
    err.message.should.equal('A pubkey who was never a member cannot be revoked');
  }));

  it('a block with a yet revoked identity should fail', test('checkRevoked', blocks.BLOCK_WITH_YET_REVOKED, {
    getWrittenIdtyByPubkey: () => Q({ revoked: true })
  }, function (err) {
    should.exist(err);
    err.message.should.equal('A revoked identity cannot be revoked again');
  }));

  it('a block with a wrong revocation signature should fail', test('checkRevoked', blocks.BLOCK_WITH_WRONG_REVOCATION_SIG, {
    getWrittenIdtyByPubkey: () => Q({})
  }, function (err) {
    should.exist(err);
    err.message.should.equal('Revocation signature must match');
  }));
});

function test (funcName, raw, dal, callback) {
  var block;
  return function() {
    return Q.Promise(function(resolve, reject){
      async.waterfall([
        function (next){
          parser.asyncWrite(raw, next);
        },
        function (obj, next){
          block = new Block(obj);
          let wotb2 = wotb.memoryInstance();
          wotb2.addNode(); // HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd
          wotb2.addNode(); // G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU
          wotb2.addNode(); // F5PtTpt8QFYMGtpZaETygB2C2yxCSxH1UW1VopBNZ6qg
          wotb2.addLink(1, 0); // G2 => Hg
          wotb2.addLink(2, 0); // F5 => Hg
          wotb2.addLink(0, 1); // Hg => G2
          wotb2.addLink(2, 1); // F5 => G2
          wotb2.addLink(0, 2); // Hg => F5
          validator(conf, { wotb: wotb2 })[funcName](block, dal).then(() => next()).catch(next);
        }
      ], function (err) {
        err && console.error(err.stack);
        err ? reject(err) : resolve();
      });
    })
      .then(callback).catch(callback);
  };
}

function validate (raw, dal, callback) {
  var block;
  return function() {
    return Q.Promise(function(resolve, reject){
      async.waterfall([
        function (next){
          parser.asyncWrite(raw, next);
        },
        function (obj, next){
          block = new Block(obj);
          validator(conf, dal).validate(block, next);
        }
      ], function (err) {
        err && console.error(err.stack);
        err ? reject(err) : resolve();
      });
    })
      .then(callback).catch(callback);
  };
}
