"use strict";
var co            = require('co');
var Q             = require('q');
var async         = require('async');
var should        = require('should');
var assert        = require('assert');
var wotb          = require('../../../app/lib/wot');
var parsers       = require('../../../app/lib/streams/parsers/doc');
var blocks        = require('../../data/blocks');
var validator     = require('../../../app/lib/globalValidator');
var parser        = parsers.parseBlock;
var Block         = require('../../../app/lib/entity/block');
var Identity      = require('../../../app/lib/entity/identity');

var conf = {
  msValidity: 365.25*24*3600, // 1 year
  sigValidity: 365.25*24*3600, // 1 year
  sigQty: 1,
  xpercent: 0.9,
  powZeroMin: 1,
  powPeriod: 18,
  incDateMin: 10,
  dt: 100,
  ud0: 100,
  c: 0.1,
  medianTimeBlocks: 200,
  percentRot: 2/3,
  blockRot: 300,
  dtDiffEval: 500
};

describe("Block global coherence:", function(){

  it('a valid block should not have any error', validate(blocks.VALID_ROOT, function (err) {
    should.not.exist(err);
  }));

  it('a valid (next) block should not have any error', validate(blocks.VALID_NEXT, function (err) {
    should.not.exist(err);
  }));

  it('a block with positive number while no root exists should fail', test('checkNumber', blocks.ROOT_BLOCK_REQUIRED, function (err) {
    should.exist(err);
    err.should.equal('Root block required first');
  }));

  it('a block with same number as current should fail', test('checkNumber', blocks.SAME_BLOCK_NUMBER, function (err) {
    should.exist(err);
    err.should.equal('Too late for this block');
  }));

  it('a block with older number than current should fail', test('checkNumber', blocks.OLD_BLOCK_NUMBER, function (err) {
    should.exist(err);
    err.should.equal('Too late for this block');
  }));

  it('a block with too far future number than current should fail', test('checkNumber', blocks.FAR_FUTURE_BLOCK_NUMBER, function (err) {
    should.exist(err);
    err.should.equal('Too early for this block');
  }));

  it('a block with wrong PreviousHash should fail', test('checkPreviousHash', blocks.WRONG_PREVIOUS_HASH, function (err) {
    should.exist(err);
    err.should.equal('PreviousHash not matching hash of current block');
  }));

  it('a block with wrong PreviousIssuer should fail', test('checkPreviousIssuer', blocks.WRONG_PREVIOUS_ISSUER, function (err) {
    should.exist(err);
    err.should.equal('PreviousIssuer not matching issuer of current block');
  }));

  it('a block with wrong Issuer should fail', test('checkIssuerIsMember', blocks.WRONG_ISSUER, function (err) {
    should.exist(err);
    err.should.equal('Issuer is not a member');
  }));

  it('a block with joiner for root block without root number shoud fail', test('checkJoiners', blocks.WRONG_JOIN_ROOT_NUMBER, function (err) {
    should.exist(err);
    err.should.equal('Number must be 0 for root block\'s memberships');
  }));

  it('a block with joiner for root block without root hash shoud fail', test('checkJoiners', blocks.WRONG_JOIN_ROOT_HASH, function (err) {
    should.exist(err);
    err.should.equal('Hash must be E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855 for root block\'s memberships');
  }));

  it('a block with joiner targeting unexisting block fail', test('checkJoiners', blocks.WRONG_JOIN_BLOCK_TARGET, function (err) {
    should.exist(err);
    err.should.equal('Membership based on an unexisting block');
  }));

  it('a block with joiner membership number lower or equal than previous should fail', test('checkJoiners', blocks.WRONG_JOIN_NUMBER_TOO_LOW, function (err) {
    should.exist(err);
    err.should.equal('Membership\'s number must be greater than last membership of the pubkey');
  }));

  it('a block with joiner membership of a yet member should fail', test('checkJoiners', blocks.WRONG_JOIN_ALREADY_MEMBER, function (err) {
    should.exist(err);
    err.should.equal('Cannot be in joiners if already a member');
  }));

  it('a block with at least one revoked joiner should fail', test('checkJoinersAreNotRevoked', blocks.REVOKED_JOINER, function (err) {
    should.exist(err);
    err.should.equal('Revoked pubkeys cannot join');
  }));

  it('a block with at least one joiner without enough certifications should fail', test('checkJoinersHaveEnoughCertifications', blocks.NOT_ENOUGH_CERTIFICATIONS_JOINER, function (err) {
    should.exist(err);
    err.should.equal('Joiner/Active does not gathers enough certifications');
  }));

  it('a block with at least one joiner without enough certifications should succeed', test('checkJoinersHaveEnoughCertifications', blocks.NOT_ENOUGH_CERTIFICATIONS_JOINER_BLOCK_0, function (err) {
    should.not.exist(err);
  }));

  it('a block with expired membership should fail', test('checkJoiners', blocks.EXPIRED_MEMBERSHIP, function (err) {
    should.exist(err);
    err.should.equal('Membership has expired');
  }));

  it('a block with at least one joiner outdistanced from WoT should fail', test('checkJoinersAreNotOudistanced', blocks.OUTDISTANCED_JOINER, function (err) {
    should.exist(err);
    err.should.equal('Joiner/Active is outdistanced from WoT');
  }));

  it('a block with active targeting unexisting block fail', test('checkActives', blocks.WRONG_ACTIVE_BLOCK_TARGET, function (err) {
    should.exist(err);
    err.should.equal('Membership based on an unexisting block');
  }));

  it('a block with certification of unknown pubkey should fail', test('checkCertificationsAreValid', blocks.WRONGLY_SIGNED_CERTIFICATION, function (err) {
    should.exist(err);
    err.should.equal('Wrong signature for certification');
  }));

  it('a block with certification to non-zero block for root block should fail', test('checkCertificationsAreValid', blocks.CERT_BASED_ON_NON_ZERO_FOR_ROOT, function (err) {
    should.exist(err);
    err.should.equal('Number must be 0 for root block\'s certifications');
  }));

  it('a block with certification to unknown block should fail', test('checkCertificationsAreValid', blocks.CERT_BASED_ON_NON_EXISTING_BLOCK, function (err) {
    should.exist(err);
    err.should.equal('Certification based on an unexisting block');
  }));

  it('a block with expired certifications should fail', test('checkCertificationsAreValid', blocks.EXPIRED_CERTIFICATIONS, function (err) {
    should.exist(err);
    err.should.equal('Certification has expired');
  }));

  it('a block with certification from non-member pubkey should fail', test('checkCertificationsAreMadeByMembers', blocks.UNKNOWN_CERTIFIER, function (err) {
    should.exist(err);
    err.should.equal('Certification from non-member');
  }));

  it('a block with certification to non-member pubkey should fail', test('checkCertificationsAreMadeToMembers', blocks.UNKNOWN_CERTIFIED, function (err) {
    should.exist(err);
    err.should.equal('Certification to non-member');
  }));

  it('a block with already used UserID should fail', test('checkIdentityUnicity', blocks.EXISTING_UID, function (err) {
    should.exist(err);
    err.should.equal('Identity already used');
  }));

  it('a block with already used pubkey should fail', test('checkPubkeyUnicity', blocks.EXISTING_PUBKEY, function (err) {
    should.exist(err);
    err.should.equal('Pubkey already used');
  }));

  it('a block with too early certification replay should fail', test('checkCertificationsDelayIsRespected', blocks.TOO_EARLY_CERTIFICATION_REPLAY, function (err) {
    should.exist(err);
    err.should.equal('A similar certification is already active');
  }));

  it('a block with kicked members not written under Excluded field should fail', test('checkKickedMembersAreExcluded', blocks.KICKED_NOT_EXCLUDED, function (err) {
    should.exist(err);
    err.should.equal('All kicked members must be present under Excluded members');
  }));

  it('a block with kicked members well written under Excluded field should succeed', test('checkKickedMembersAreExcluded', blocks.KICKED_EXCLUDED, function (err) {
    should.not.exist(err);
  }));

  it('a block with wrong members count should fail', test('checkMembersCountIsGood', blocks.WRONG_MEMBERS_COUNT, function (err) {
    should.exist(err);
    err.should.equal('Wrong members count');
  }));

  it('a block not starting with a leading zero should fail', test('checkProofOfWork', blocks.NO_LEADING_ZERO, function (err) {
    should.exist(err);
    err.should.equal('Wrong proof-of-work level: given 0 zeros and \'F\', required was 0 zeros and an hexa char between [0-7]');
  }));

  it('a block requiring 2 leading zeros but providing less should fail', test('checkProofOfWork', blocks.REQUIRES_7_LEADING_ZEROS, function (err) {
    should.exist(err);
    err.should.equal('Wrong proof-of-work level: given 0 zeros and \'B\', required was 0 zeros and an hexa char between [0-3]');
  }));

  it('a block requiring 1 leading zeros but providing less should fail', test('checkProofOfWork', blocks.REQUIRES_6_LEADING_ZEROS, function (err) {
    should.exist(err);
    err.should.equal('Wrong proof-of-work level: given 0 zeros and \'8\', required was 0 zeros and an hexa char between [0-7]');
  }));

  it('a block requiring 1 leading zeros as first block of newcomer should succeed', test('checkProofOfWork', blocks.FIRST_BLOCK_OF_NEWCOMER, function (err) {
    should.not.exist(err);
  }));

  it('a block requiring 40 leading zeros as second block of newcomer should fail', test('checkProofOfWork', blocks.SECOND_BLOCK_OF_NEWCOMER, function (err) {
    should.exist(err);
    err.should.equal('Wrong proof-of-work level: given 0 zeros and \'F\', required was 10 zeros and an hexa char between [0-9A-F]');
  }));

  it('a root block should not fail for time reason', test('checkTimes', blocks.WRONG_ROOT_DATES, function (err) {
    should.not.exist(err);
  }));

  it('a block with wrong median for an odd number of blocks should fail', test('checkTimes', blocks.WRONG_MEDIAN_TIME_ODD, function (err) {
    should.exist(err);
    err.should.equal('Wrong MedianTime');
  }));

  it('a block with wrong median for an even number of blocks should fail', test('checkTimes', blocks.WRONG_MEDIAN_TIME_EVEN, function (err) {
    should.exist(err);
    err.should.equal('Wrong MedianTime');
  }));

  it('a block whose median time is correct (odd) should pass', test('checkTimes', blocks.GOOD_MEDIAN_TIME_ODD, function (err) {
    should.not.exist(err);
  }));

  it('a block whose median time is correct (even) should pass', test('checkTimes', blocks.GOOD_MEDIAN_TIME_EVEN, function (err) {
    should.not.exist(err);
  }));

  it('a root block with Universal Dividend should fail', test('checkUD', blocks.ROOT_BLOCK_WITH_UD, function (err) {
    should.exist(err);
    err.should.equal('Root block cannot have UniversalDividend field');
  }));

  it('first block with Universal Dividend should not happen before root time + dt', test('checkUD', blocks.FIRST_UD_BLOCK_WITH_UD_THAT_SHOULDNT, function (err) {
    should.exist(err);
    err.should.equal('This block cannot have UniversalDividend');
  }));

  it('first block with Universal Dividend should happen on root time + dt', test('checkUD', blocks.FIRST_UD_BLOCK_WITH_UD_THAT_SHOULD, function (err) {
    should.exist(err);
    err.should.equal('Block must have a UniversalDividend field');
  }));

  it('a block without Universal Dividend whereas it have to have one should fail', test('checkUD', blocks.UD_BLOCK_WIHTOUT_UD, function (err) {
    should.exist(err);
    err.should.equal('Block must have a UniversalDividend field');
  }));

  it('a block with wrong Universal Dividend value should fail', test('checkUD', blocks.BLOCK_WITH_WRONG_UD, function (err) {
    should.exist(err);
    err.should.equal('UniversalDividend must be equal to 121');
  }));

  it('a block with wrong UnitBase value should fail', test('checkUD', blocks.BLOCK_WITH_WRONG_UNIT_BASE, function (err) {
    should.exist(err);
    err.should.equal('UnitBase must be equal to 3');
  }));

  it('a root block with unlegitimated Universal Dividend presence should fail', test('checkUD', blocks.BLOCK_UNLEGITIMATE_UD, function (err) {
    should.exist(err);
    err.should.equal('This block cannot have UniversalDividend');
  }));

  it('a root block with unlegitimated Universal Dividend presence should fail', test('checkUD', blocks.BLOCK_UNLEGITIMATE_UD_2, function (err) {
    should.exist(err);
    err.should.equal('This block cannot have UniversalDividend');
  }));


  it('a block without transactions should pass', test('checkTransactions', blocks.BLOCK_WITHOUT_TRANSACTIONS, function (err) {
    should.not.exist(err);
  }));

  it('a block with good transactions should pass', test('checkTransactions', blocks.BLOCK_WITH_GOOD_TRANSACTIONS, function (err) {
    should.not.exist(err);
  }));

  it('a block with wrong transaction sum should fail', test('checkTransactions', blocks.BLOCK_WITH_WRONG_TRANSACTION_SUMS, function (err) {
    should.exist(err);
    err.uerr.message.should.equal('Sum of inputs must equal sum of outputs');
  }));

  it('a block with wrong transaction unit bases should fail', test('checkTransactions', blocks.BLOCK_WITH_WRONG_TRANSACTION_SUMS, function (err) {
    should.exist(err);
    err.uerr.message.should.equal('Sum of inputs must equal sum of outputs');
  }));

  it('a block with whose transaction has too high unit bases should fail', test('checkTransactions', blocks.BLOCK_WITH_WRONG_TRANSACTION_UNIT_BASES, function (err) {
    should.exist(err);
    err.uerr.message.should.equal('Wrong unit base for outputs');
  }));

  it('a block with unavailable UD source should fail', test('checkTransactions', blocks.BLOCK_WITH_UNAVAILABLE_UD_SOURCE, function (err) {
    should.exist(err);
    err.should.have.property('uerr').property('message').equal('Source already consumed');
  }));

  it('a block with unavailable TX source should fail', test('checkTransactions', blocks.BLOCK_WITH_UNAVAILABLE_TX_SOURCE, function (err) {
    should.exist(err);
    err.should.have.property('uerr').property('message').equal('Source already consumed');
  }));

  it('a block with an unknown member revoked should fail', test('checkRevoked', blocks.BLOCK_UNKNOWN_REVOKED, function (err) {
    should.exist(err);
    err.should.equal('A pubkey who was never a member cannot be revoked');
  }));

  it('a block with a yet revoked identity should fail', test('checkRevoked', blocks.BLOCK_WITH_YET_REVOKED, function (err) {
    should.exist(err);
    err.should.equal('A revoked identity cannot be revoked again');
  }));

  it('a block with a wrong revocation signature should fail', test('checkRevoked', blocks.BLOCK_WITH_WRONG_REVOCATION_SIG, function (err) {
    should.exist(err);
    err.should.equal('Revocation signature must match');
  }));
});

function test (funcName, raw, callback) {
  var block;
  return function() {
    return Q.Promise(function(resolve, reject){
      async.waterfall([
        function (next){
          parser.asyncWrite(raw, next);
        },
        function (obj, next){
          block = new Block(obj);
          let dao = new BlockCheckerDao(block);
          dao.wotb.addNode(); // HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd
          dao.wotb.addNode(); // G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU
          dao.wotb.addNode(); // F5PtTpt8QFYMGtpZaETygB2C2yxCSxH1UW1VopBNZ6qg
          dao.wotb.addLink(1, 0); // G2 => Hg
          dao.wotb.addLink(2, 0); // F5 => Hg
          dao.wotb.addLink(0, 1); // Hg => G2
          dao.wotb.addLink(2, 1); // F5 => G2
          dao.wotb.addLink(0, 2); // Hg => F5
          validator(conf, dao)[funcName](block, next);
        }
      ], function (err) {
        err ? reject(err) : resolve();
      });
    })
      .then(callback).catch(callback);
  }
}

function validate (raw, callback) {
  var block;
  return function() {
    return Q.Promise(function(resolve, reject){
      async.waterfall([
        function (next){
          parser.asyncWrite(raw, next);
        },
        function (obj, next){
          block = new Block(obj);
          validator(conf, new BlockCheckerDao(block)).validate(block, next);
        }
      ], function (err) {
        err ? reject(err) : resolve();
      });
    })
      .then(callback).catch(callback)
  };
}

/**
* Mock dao for testing
*/
function BlockCheckerDao (block) {

  this.wotb = wotb.memoryInstance();

  this.existsUserID = function (uid, done) {
    if (uid == 'EXISTING') {
      done(null, true);
    } else {
      done(null, false);
    }
  }
  
  this.existsPubkey = function (pubkey, done) {
    if (pubkey == 'HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH') {
      done(null, true);
    } else {
      done(null, false);
    }
  }
  
  this.getIdentityByPubkey = function (pubkey, done) {
    // No existing identity
    if (pubkey == 'CCCCJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd')
      done(null, new Identity({ pubkey: 'CCCCJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd' }));
    else if (pubkey == 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
      done(null, new Identity({ pubkey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', revoked: true }));
    else if (pubkey == 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd')
      done(null, new Identity({ pubkey: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', revoked: false, wotb_id: 0 }));
    else
      done(null, null);
  }
  
  this.isMember = function (pubkey, done) {
    // No existing member
    if (block.number == 0)
      done(null, false);
    else if (block.number == 51 && pubkey == 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd')
      done(null, true);
    else {
      var members = [
        'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
        'G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU',
      ];
      done(null, ~members.indexOf(pubkey));
    }
  };

  this.isLeaving = function (pubkey, done) {
    done(null, false);
  };

  this.getPreviousLinkFor = function (from, to, done) {
    if (from == 'G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU'
      && to == 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC') {
      done(null, {
        timestamp: '1380218401' // Exactly 1 second remaining
      });
    } else {
      done(null, null);
    }
  }

  this.getValidLinksTo = function (to, done) {
    done(null, []);
  }

  this.getMembers = function (done) {
    if (block.number == 0)
      done(null, []);
    else {
      done(null, [
        { pubkey: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd' },
        { pubkey: 'G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU' },
      ]);
    }
  }

  this.getPreviousLinkFromTo = function (from, to, done) {
    done(null, []);
  }

  this.getValidLinksFrom = function (member, done) {
    done(null, []);
  }

  this.getCurrent = function (done) {
    if (block.number == 3)      
      done(null, { number: 2, hash: '52DC8A585C5D89571C511BB83F7E7D3382F0041452064B1272E65F0B42B82D57', issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', membersCount: 3, time: 1411776000, medianTime: 1411776000 });
    else if (block.number == 4)
      done(null, { number: 3, hash: '2A27BD040B16B7AF59DDD88890E616987F4DD28AA47B9ABDBBEE46257B88E945', issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', membersCount: 3 });
    else if (block.number == 20)
      done(null, { number: 19, time: 1411773000, medianTime: 1411773000 });
    else if (block.number == 48)
      done(null, { number: 46 });
    else if (block.number == 47)
      done(null, { number: 47 });
    else if (block.number == 51)
      done(null, { number: 50, hash: '4C8800825C44A22F230AFC0D140BF1930331A686899D16EBE4C58C9F34C609E8', issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', membersCount: 3 });
    else if (block.number == 50)
      done(null, { number: 50, hash: '4C8800825C44A22F230AFC0D140BF1930331A686899D16EBE4C58C9F34C609E8', issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', membersCount: 3 });
    else if (block.number == 49)
      done(null, { number: 50, hash: '4C8800825C44A22F230AFC0D140BF1930331A686899D16EBE4C58C9F34C609E8', issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', membersCount: 3 });
    else if (block.number == 52)
      done(null, { number: 50, hash: '4C8800825C44A22F230AFC0D140BF1930331A686899D16EBE4C58C9F34C609E8', issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', membersCount: 3 });
    else if (block.number == 70)
      done(null, { number: 69, time: 1411777000, medianTime: 1411777000 });
    else if (block.number == 71)
      done(null, { number: 70, time: 1411775000, medianTime: 1411775000 });
    else if (block.number == 72)
      done(null, { number: 71, time: 1411777000, medianTime: 1411777000 });
    else if (block.number == 73)
      done(null, { number: 72, time: 1411777000, medianTime: 1411776000 });
    else if (block.number == 80)
      done(null, { time: 1411777000, medianTime: 1411777000 });
    else if (block.number == 81)
      done(null, { time: 1411777000, medianTime: 1411777000 });
    else if (block.number == 82)
      done(null, { time: 1411777000, medianTime: 1411777000 });
    else if (block.number == 83)
      done(null, { time: 1411777000, medianTime: 1411777000 });
    // Tests for TrialLevel
    else if (block.number >= 60 && block.number <= 67)
      done(null, { number: block.number - 1 });
    else if (block.number == 90)
      done(null, { time: 1443333600, medianTime: 1443333600 });
    else if (block.number == 101)
      done(null, { number: 100 });
    else if (block.number == 102)
      done(null, { number: 101 });
    else if (block.number == 103)
      done(null, { number: 102 });
    else if (block.number == 104)
      done(null, { number: 103 });
    else if (block.number == 160)
      done(null, { time: 1411777000, medianTime: 1411777000 });
    else
      done(null, null);
  }

  this.getBlock = function (number, done) {
    var block2;
    if (number == 0) {
      block2 = { hash: 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855', medianTime: 1411773000, powMin: 1 };
    }
    else if (number == 2) {
      block2 = { number: 3, powMin: 1 };
    }
    else if (block.number == 3 && number == 1) {
      block2 = { time: 1411776000, powMin: 1 };
    }
    else if (number == 70) {
      block2 = { medianTime: 1411775000, powMin: 1 };
    }
    else if (number == 59) {
      block2 = { issuer: 'G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU', powMin: 1 };
    }
    else if (number == 60) {
      block2 = { issuer: 'AbCCJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', powMin: 1 };
    }
    else if (number == 61) {
      block2 = { issuer: 'G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU', powMin: 1 };
    }
    else if (number == 63) {
      block2 = { issuer: 'AbCCJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', powMin: 1 };
    }
    else if (number == 64) {
      block2 = { issuer: 'G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU', powMin: 1 };
    }
    else if (number == 65) {
      block2 = { issuer: 'AbCCJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', powMin: 10 };
    }
    else if (number == 66) {
      block2 = { issuer: 'AbCCJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', powMin: 1 };
    }
    else if (number == 50) {
      block2 = { time: 160, powMin: 1 };
    }
    else if (number == 51) {
      block2 = { time: 161, powMin: 1 };
    }
    else if (number == 52) {
      block2 = { time: 162, powMin: 1 };
    }
    else {
      done && done('No block found');
      throw 'No block found';
    }
    done && done(null, block2);
    return Q(block2);
  };

  this.getToBeKicked = function (blockNumber, done) {
    if (block.number != 4)
      done(null, []);
    else {
      done(null, [
        { pubkey: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd' },
        { pubkey: 'G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU' },
      ]);
    }
  }

  this.lastBlockOfIssuer = function (issuer) {
    if (block.number == 60 && issuer == 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd') {
      return Q({
        number: 59,
        hash: '0000AB8A955B2196FB8560DCDA7A70B19DDB3433' // 4 zeros + 0 interblock - 0 block since = 4 required zeros
      });
    } else if (block.number == 61 && issuer == 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd') {
      return Q({
        number: 60 // 3 issuers, 0 block since, 2/3 percent, 1 powMin = 2 required zeros
      });
    } else if (block.number == 66 && issuer == 'AbCCJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd') {
      return Q({
        number: 63 // 18 issuers, 2 blocks since, 2/3 percent + 10 powMin ==> 10 * (2/3 * 18 / (1 + 2)) ==> 10 * 12/3 ==> 40
      });
    } else if (block.number == 67 && issuer == 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd') {
      return Q({
        number: 62 // 18 issuers, 11 blocks since, 1 powMin = 1 required zeros
      });
    } else {
      return Q(null);
    }
  };

  this.getLastUDBlock = function (done) {
    if (block.number == 0) {
      done(null, null);
    } else if (block.number == 80) {
      done(null, { UDTime: 1411776900, medianTime: 1411776900, monetaryMass: 300 * 10000, dividend: 100, unitbase: 4 });
    } else if (block.number == 81) {
      done(null, { UDTime: 1411776900, medianTime: 1411776900, monetaryMass: 3620 * 10000, dividend: 110, unitbase: 4 });
    } else if (block.number == 82) {
      done(null, { UDTime: 1411777000, medianTime: 1411777000, monetaryMass: 3620 * 10000, dividend: 110, unitbase: 4 });
    } else if (block.number == 83) {
      done(null, { UDTime: 1411777000, medianTime: 1411777000, monetaryMass: 3620 * 10000, dividend: 110, unitbase: 4 });
    } else if (block.number == 160) {
      done(null, { UDTime: 1411777000, medianTime: 1411777000, monetaryMass: 12345678900, dividend: 100, unitbase: 2 });
    } else {
      done(null, null);
    }
  }

  this.existsUDSource = function (number, fpr, done) {
    var existing = [
      'D:HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd:46',
      'D:HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd:55'
    ];
    var exists = ~existing.indexOf([number, fpr].join(':')) ? true : false;
    done(null, exists);
  }

  this.existsTXSource = function (number, fpr, done) {
    var existing = [
      'T:6991C993631BED4733972ED7538E41CCC33660F554E3C51963E2A0AC4D6453D3:4',
      'T:3A09A20E9014110FD224889F13357BAB4EC78A72F95CA03394D8CCA2936A7435:78',
      'T:A0D9B4CDC113ECE1145C5525873821398890AE842F4B318BD076095A23E70956:66',
      'T:67F2045B5318777CC52CD38B424F3E40DDA823FA0364625F124BABE0030E7B5B:176',
      'T:2C31D8915801E759F6D4FF3DA8DA983D7D56DCF4F8D94619FCFAD4B128362326:88'
    ];
    var exists = ~existing.indexOf([number, fpr].join(':')) ? true : false;
    done(null, exists);
  }

  this.getSource = function (identifier, noffset) {
    var existing = [
      'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd:46',
      'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd:47',
      '6991C993631BED4733972ED7538E41CCC33660F554E3C51963E2A0AC4D6453D3:4',
      '3A09A20E9014110FD224889F13357BAB4EC78A72F95CA03394D8CCA2936A7435:10',
      'A0D9B4CDC113ECE1145C5525873821398890AE842F4B318BD076095A23E70956:66',
      '67F2045B5318777CC52CD38B424F3E40DDA823FA0364625F124BABE0030E7B5B:176'
    ];
    var index = existing.indexOf([identifier, noffset].join(':'));
    let obj = index !== -1 ? existing[index] : null;
    if (obj) {
      obj = {
        amount: index == 4 ? 235 : 0,
        base: index == 3 ? 3 : 4
      };
    }
    return Q(obj);
  };

  this.findBlock = function (number, hash, done) {
    if (number == 2 && hash == '65DDE908DC06D42EC8AAAE4AB716C299ECD4891740349BCF50EF3D70C947CBE0')
      done(null, {});
    else if (number == 3 && hash == '65DDE908DC06D42EC8AAAE4AB716C299ECD4891740349BCF50EF3D70C947CBE0')
      done(null, {});
    else if (number == 70 && hash == '5918CE7F40186F8E0BD8F239986A723FCC329927B999885B32DAAE40EA8BEDB6')
      done(null, { medianTime: 1411775000 });
    else
      done(null, null);
  }

  this.getCurrentMembershipNumber = function (pubkey, done) {
    if (block.number == 12 && pubkey == 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd')
      done(null, 2);
    else
      done(null, -1);
  }

  this.getIssuersBetween = function (bStart, bEnd, done) {
    if (block.number == 66)
      done(null, [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,18,18]);
    else if (block.number == 61)
      done(null, [1,2,3]);
    else if (block.number == 60)
      done(null, [1,2]);
    else
      done(null, []);
  }

  this.getPreviousLinkFrom = () => co(function *() {
    return null;
  });

  this.getTimesBetween = function (bStart, bEnd, done) {
    if (block.number == 66)
      done(null, [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,18,18]);
    else if (block.number == 61)
      done(null, [1,2,3]);
    else if (block.number == 60)
      done(null, [1,2]);
    else if (block.number == 3)
      done(null, [1411776000,1411776000,1411776000]);
    else if (block.number == 103) {
      var times = [];
      for (var i = 0; i < 103; i++)
        times.push(161);
      done(null, times);
    }
    else if (block.number == 104) {
      var times = [];
      for (var i = 0; i < 104; i++)
        times.push(162);
      done(null, times);
    }
    else
      done(null, []);
  };

  this.getIdentityByPubkeyP = (pubkey) => co(function *() {
    if (pubkey == 'BBTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd') {
      return {
        revoked: true
      };
    }
    if (pubkey == 'CCTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd') {
      return {
        revoked: false
      };
    }
    return null;
  });

}
