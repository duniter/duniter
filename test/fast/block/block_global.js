"use strict";
var Q             = require('q');
var async         = require('async');
var should        = require('should');
var assert        = require('assert');
var parsers       = require('../../../app/lib/streams/parsers/doc');
var blocks        = require('../../data/blocks');
var validator     = require('../../../app/lib/globalValidator');
var parser        = parsers.parseBlock;
var Block         = require('../../../app/lib/entity/block');
var Identity      = require('../../../app/lib/entity/identity');

var conf = {
  sigDelay: 365.25*24*3600, // 1 year
  msValidity: 365.25*24*3600, // 1 year
  sigValidity: 365.25*24*3600, // 1 year
  sigQty: 1,
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

  it('a valid block should not have any error', validate(blocks.VALID_ROOT, function (err, done) {
    should.not.exist(err);
    done();
  }));

  it('a valid (next) block should not have any error', validate(blocks.VALID_NEXT, function (err, done) {
    should.not.exist(err);
    done();
  }));

  it('a block with positive number while no root exists should fail', test('checkNumber', blocks.ROOT_BLOCK_REQUIRED, function (err, done) {
    should.exist(err);
    err.should.equal('Root block required first');
    done();
  }));

  it('a block with same number as current should fail', test('checkNumber', blocks.SAME_BLOCK_NUMBER, function (err, done) {
    should.exist(err);
    err.should.equal('Too late for this block');
    done();
  }));

  it('a block with older number than current should fail', test('checkNumber', blocks.OLD_BLOCK_NUMBER, function (err, done) {
    should.exist(err);
    err.should.equal('Too late for this block');
    done();
  }));

  it('a block with too far future number than current should fail', test('checkNumber', blocks.FAR_FUTURE_BLOCK_NUMBER, function (err, done) {
    should.exist(err);
    err.should.equal('Too early for this block');
    done();
  }));

  it('a block with wrong PreviousHash should fail', test('checkPreviousHash', blocks.WRONG_PREVIOUS_HASH, function (err, done) {
    should.exist(err);
    err.should.equal('PreviousHash not matching hash of current block');
    done();
  }));

  it('a block with wrong PreviousIssuer should fail', test('checkPreviousIssuer', blocks.WRONG_PREVIOUS_ISSUER, function (err, done) {
    should.exist(err);
    err.should.equal('PreviousIssuer not matching issuer of current block');
    done();
  }));

  it('a block with wrong Issuer should fail', test('checkIssuerIsMember', blocks.WRONG_ISSUER, function (err, done) {
    should.exist(err);
    err.should.equal('Issuer is not a member');
    done();
  }));

  it('a block with joiner for root block without root number shoud fail', test('checkJoiners', blocks.WRONG_JOIN_ROOT_NUMBER, function (err, done) {
    should.exist(err);
    err.should.equal('Number must be 0 for root block\'s memberships');
    done();
  }));

  it('a block with joiner for root block without root hash shoud fail', test('checkJoiners', blocks.WRONG_JOIN_ROOT_HASH, function (err, done) {
    should.exist(err);
    err.should.equal('Hash must be DA39A3EE5E6B4B0D3255BFEF95601890AFD80709 for root block\'s memberships');
    done();
  }));

  it('a block with joiner targeting unexisting block fail', test('checkJoiners', blocks.WRONG_JOIN_BLOCK_TARGET, function (err, done) {
    should.exist(err);
    err.should.equal('Membership based on an unexisting block');
    done();
  }));

  it('a block with joiner membership number lower or equal than previous should fail', test('checkJoiners', blocks.WRONG_JOIN_NUMBER_TOO_LOW, function (err, done) {
    should.exist(err);
    err.should.equal('Membership\'s number must be greater than last membership of the pubkey');
    done();
  }));

  it('a block with joiner membership of a yet member should fail', test('checkJoiners', blocks.WRONG_JOIN_ALREADY_MEMBER, function (err, done) {
    should.exist(err);
    err.should.equal('Cannot be in joiners if already a member');
    done();
  }));

  it('a block with at least one revoked joiner should fail', test('checkJoinersAreNotRevoked', blocks.REVOKED_JOINER, function (err, done) {
    should.exist(err);
    err.should.equal('Revoked pubkeys cannot join');
    done();
  }));

  it('a block with at least one joiner without enough certifications should fail', test('checkJoinersHaveEnoughCertifications', blocks.NOT_ENOUGH_CERTIFICATIONS_JOINER, function (err, done) {
    should.exist(err);
    err.should.equal('Joiner/Active does not gathers enough certifications');
    done();
  }));

  it('a block with at least one joiner without enough certifications should succeed', test('checkJoinersHaveEnoughCertifications', blocks.NOT_ENOUGH_CERTIFICATIONS_JOINER_BLOCK_0, function (err, done) {
    should.not.exist(err);
    done();
  }));

  it('a block with expired membership should fail', test('checkJoiners', blocks.EXPIRED_MEMBERSHIP, function (err, done) {
    should.exist(err);
    err.should.equal('Membership has expired');
    done();
  }));

  it('a block with at least one joiner outdistanced from WoT should fail', test('checkJoinersAreNotOudistanced', blocks.OUTDISTANCED_JOINER, function (err, done) {
    should.exist(err);
    err.should.equal('Joiner/Active is outdistanced from WoT');
    done();
  }));

  it('a block with active targeting unexisting block fail', test('checkActives', blocks.WRONG_ACTIVE_BLOCK_TARGET, function (err, done) {
    should.exist(err);
    err.should.equal('Membership based on an unexisting block');
    done();
  }));

  it('a block with certification of unknown pubkey should fail', test('checkCertificationsAreValid', blocks.WRONGLY_SIGNED_CERTIFICATION, function (err, done) {
    should.exist(err);
    err.should.equal('Wrong signature for certification');
    done();
  }));

  it('a block with certification to non-zero block for root block should fail', test('checkCertificationsAreValid', blocks.CERT_BASED_ON_NON_ZERO_FOR_ROOT, function (err, done) {
    should.exist(err);
    err.should.equal('Number must be 0 for root block\'s certifications');
    done();
  }));

  it('a block with certification to unknown block should fail', test('checkCertificationsAreValid', blocks.CERT_BASED_ON_NON_EXISTING_BLOCK, function (err, done) {
    should.exist(err);
    err.should.equal('Certification based on an unexisting block');
    done();
  }));

  it('a block with expired certifications should fail', test('checkCertificationsAreValid', blocks.EXPIRED_CERTIFICATIONS, function (err, done) {
    should.exist(err);
    err.should.equal('Certification has expired');
    done();
  }));

  it('a block with certification from non-member pubkey should fail', test('checkCertificationsAreMadeByMembers', blocks.UNKNOWN_CERTIFIER, function (err, done) {
    should.exist(err);
    err.should.equal('Certification from non-member');
    done();
  }));

  it('a block with certification to non-member pubkey should fail', test('checkCertificationsAreMadeToMembers', blocks.UNKNOWN_CERTIFIED, function (err, done) {
    should.exist(err);
    err.should.equal('Certification to non-member');
    done();
  }));

  it('a block with already used UserID should fail', test('checkIdentityUnicity', blocks.EXISTING_UID, function (err, done) {
    should.exist(err);
    err.should.equal('Identity already used');
    done();
  }));

  it('a block with already used pubkey should fail', test('checkPubkeyUnicity', blocks.EXISTING_PUBKEY, function (err, done) {
    should.exist(err);
    err.should.equal('Pubkey already used');
    done();
  }));

  it('a block with too early certification replay should fail', test('checkCertificationsDelayIsRespected', blocks.TOO_EARLY_CERTIFICATION_REPLAY, function (err, done) {
    should.exist(err);
    err.should.equal('Too early for this certification');
    done();
  }));

  it('a block with kicked members not written under Excluded field should fail', test('checkKickedMembersAreExcluded', blocks.KICKED_NOT_EXCLUDED, function (err, done) {
    should.exist(err);
    err.should.equal('All kicked members must be present under Excluded members');
    done();
  }));

  it('a block with kicked members well written under Excluded field should succeed', test('checkKickedMembersAreExcluded', blocks.KICKED_EXCLUDED, function (err, done) {
    should.not.exist(err);
    done();
  }));

  it('a block with wrong members count should fail', test('checkMembersCountIsGood', blocks.WRONG_MEMBERS_COUNT, function (err, done) {
    should.exist(err);
    err.should.equal('Wrong members count');
    done();
  }));

  it('a block not starting with a leading zero should fail', test('checkProofOfWork', blocks.NO_LEADING_ZERO, function (err, done) {
    should.exist(err);
    err.should.equal('Wrong proof-of-work level: given 0 zeros, required was 1 zeros');
    done();
  }));

  it('a block requiring 2 leading zeros but providing less should fail', test('checkProofOfWork', blocks.REQUIRES_7_LEADING_ZEROS, function (err, done) {
    should.exist(err);
    err.should.equal('Wrong proof-of-work level: given 0 zeros, required was 2 zeros');
    done();
  }));

  it('a block requiring 1 leading zeros but providing less should fail', test('checkProofOfWork', blocks.REQUIRES_6_LEADING_ZEROS, function (err, done) {
    should.exist(err);
    err.should.equal('Wrong proof-of-work level: given 0 zeros, required was 1 zeros');
    done();
  }));

  it('a block requiring 1 leading zeros as first block of newcomer should succeed', test('checkProofOfWork', blocks.FIRST_BLOCK_OF_NEWCOMER, function (err, done) {
    should.not.exist(err);
    done();
  }));

  it('a block requiring 40 leading zeros as second block of newcomer should fail', test('checkProofOfWork', blocks.SECOND_BLOCK_OF_NEWCOMER, function (err, done) {
    should.exist(err);
    err.should.equal('Wrong proof-of-work level: given 0 zeros, required was 40 zeros');
    done();
  }));

  it('a root block should not fail for time reason', test('checkTimes', blocks.WRONG_ROOT_DATES, function (err, done) {
    should.not.exist(err);
    done();
  }));

  it('a block with wrong median for an odd number of blocks should fail', test('checkTimes', blocks.WRONG_MEDIAN_TIME_ODD, function (err, done) {
    should.exist(err);
    err.should.equal('Wrong MedianTime');
    done();
  }));

  it('a block with wrong median for an even number of blocks should fail', test('checkTimes', blocks.WRONG_MEDIAN_TIME_EVEN, function (err, done) {
    should.exist(err);
    err.should.equal('Wrong MedianTime');
    done();
  }));

  it('a block whose median time is correct (odd) should pass', test('checkTimes', blocks.GOOD_MEDIAN_TIME_ODD, function (err, done) {
    should.not.exist(err);
    done();
  }));

  it('a block whose median time is correct (even) should pass', test('checkTimes', blocks.GOOD_MEDIAN_TIME_EVEN, function (err, done) {
    should.not.exist(err);
    done();
  }));

  it('a root block with Universal Dividend should fail', test('checkUD', blocks.ROOT_BLOCK_WITH_UD, function (err, done) {
    should.exist(err);
    err.should.equal('Root block cannot have UniversalDividend field');
    done();
  }));

  it('first block with Universal Dividend should not happen before root time + dt', test('checkUD', blocks.FIRST_UD_BLOCK_WITH_UD_THAT_SHOULDNT, function (err, done) {
    should.exist(err);
    err.should.equal('This block cannot have UniversalDividend');
    done();
  }));

  it('first block with Universal Dividend should happen on root time + dt', test('checkUD', blocks.FIRST_UD_BLOCK_WITH_UD_THAT_SHOULD, function (err, done) {
    should.exist(err);
    err.should.equal('Block must have a UniversalDividend field');
    done();
  }));

  it('a block without Universal Dividend whereas it have to have one should fail', test('checkUD', blocks.UD_BLOCK_WIHTOUT_UD, function (err, done) {
    should.exist(err);
    err.should.equal('Block must have a UniversalDividend field');
    done();
  }));

  it('a block with wrong Universal Dividend value should fail', test('checkUD', blocks.BLOCK_WITH_WRONG_UD, function (err, done) {
    should.exist(err);
    err.should.equal('UniversalDividend must be equal to 121');
    done();
  }));

  it('a root block with unlegitimated Universal Dividend presence should fail', test('checkUD', blocks.BLOCK_UNLEGITIMATE_UD, function (err, done) {
    should.exist(err);
    err.should.equal('This block cannot have UniversalDividend');
    done();
  }));

  it('a root block with unlegitimated Universal Dividend presence should fail', test('checkUD', blocks.BLOCK_UNLEGITIMATE_UD_2, function (err, done) {
    should.exist(err);
    err.should.equal('This block cannot have UniversalDividend');
    done();
  }));


  it('a block without transactions should pass', test('checkTransactions', blocks.BLOCK_WITHOUT_TRANSACTIONS, function (err, done) {
    should.not.exist(err);
    done();
  }));

  it('a block with good transactions should pass', test('checkTransactions', blocks.BLOCK_WITH_GOOD_TRANSACTIONS, function (err, done) {
    should.not.exist(err);
    done();
  }));

  it('a block with wrong UD source amount should fail', test('checkTransactions', blocks.BLOCK_WITH_WRONG_UD_AMOUNT, function (err, done) {
    should.exist(err);
    err.should.equal('Source 9WYHTavL1pmhunFCzUwiiq4pXwvgGG5ysjZnjz9H8yB:D:46:F4A47E39BC2A20EE69DCD5CAB0A9EB3C92FD8F7B:100 is not available');
    done();
  }));

  it('a block with wrong UD source amount should fail', test('checkTransactions', blocks.BLOCK_WITH_WRONG_TX_AMOUNT, function (err, done) {
    should.exist(err);
    err.should.equal('Source 9WYHTavL1pmhunFCzUwiiq4pXwvgGG5ysjZnjz9H8yB:T:176:0651DE13A80EB0515A5D9F29E25D5D777152DE91:60 is not available');
    done();
  }));

  // it('a block with wrong UD source should fail', test('checkTransactions', blocks.BLOCK_WITH_WRONG_UD_SOURCE, function (err, done) {
  //   should.exist(err);
  //   err.should.equal('Source D:33:F4A47E39BC2A20EE69DCD5CAB0A9EB3C92FD8F7B does not exist');
  //   done();
  // }));

  // it('a block with wrong TX source should fail', test('checkTransactions', blocks.BLOCK_WITH_WRONG_TX_SOURCE, function (err, done) {
  //   should.exist(err);
  //   err.should.equal('Source T:44:1D02FF8A7AE0037DF33F09C8750C0F733D61B7BD does not exist');
  //   done();
  // }));

  it('a block with unavailable UD source should fail', test('checkTransactions', blocks.BLOCK_WITH_UNAVAILABLE_UD_SOURCE, function (err, done) {
    should.exist(err);
    err.should.equal('Source HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY:D:55:C3AE457BB31EA0B0DF811CF615E81CB46FEFDBE9:40 is not available');
    done();
  }));

  it('a block with unavailable TX source should fail', test('checkTransactions', blocks.BLOCK_WITH_UNAVAILABLE_TX_SOURCE, function (err, done) {
    should.exist(err);
    err.should.equal('Source HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY:T:88:B3052F06756154DC11033D4F3E1771AC30054E1F:40 is not available');
    done();
  }));
});

function test (funcName, raw, callback) {
  var block;
  return function (done) {
    async.waterfall([
      function (next){
        parser.asyncWrite(raw, next);
      },
      function (obj, next){
        block = new Block(obj);
        validator(conf, new BlockCheckerDao(block))[funcName](block, next);
      },
    ], function (err) {
      callback(err, done);
    });
  };
}

function validate (raw, callback) {
  var block;
  return function (done) {
    async.waterfall([
      function (next){
        parser.asyncWrite(raw, next);
      },
      function (obj, next){
        block = new Block(obj);
        validator(conf, new BlockCheckerDao(block)).validate(block, next);
      },
    ], function (err) {
      callback(err, done);
    });
  };
}

/**
* Mock dao for testing
*/
function BlockCheckerDao (block) {
  
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

  this.getMembersWithEnoughSigWoT = function (minSigWoT, done) {
    if (block.number == 0)
      done(null, []);
    else {
      done(null, [
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
      done(null, { number: 2, hash: '15978746968DB6BE3CDAF243E372FEB35F7B0924', issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', membersCount: 3, time: 1411776000, medianTime: 1411776000 });
    else if (block.number == 4)
      done(null, { number: 3, hash: '4AE9FA0A8299A828A886C0EB30C930C7CF302A72', issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', membersCount: 3 });
    else if (block.number == 20)
      done(null, { number: 19, time: 1411773000, medianTime: 1411773000 });
    else if (block.number == 48)
      done(null, { number: 46 });
    else if (block.number == 47)
      done(null, { number: 47 });
    else if (block.number == 51)
      done(null, { number: 50, hash: 'E5B4669FF9B5576EE649BB3CD84AC530DED1F34B', issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', membersCount: 3 });
    else if (block.number == 50)
      done(null, { number: 50, hash: 'E5B4669FF9B5576EE649BB3CD84AC530DED1F34B', issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', membersCount: 3 });
    else if (block.number == 49)
      done(null, { number: 50, hash: 'E5B4669FF9B5576EE649BB3CD84AC530DED1F34B', issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', membersCount: 3 });
    else if (block.number == 52)
      done(null, { number: 50, hash: 'E5B4669FF9B5576EE649BB3CD84AC530DED1F34B', issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', membersCount: 3 });
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
    else
      done(null, null);
  }

  this.getBlock = function (number, done) {
    var block2;
    if (number == 0) {
      block2 = { hash: 'DA39A3EE5E6B4B0D3255BFEF95601890AFD80709', medianTime: 1411773000, powMin: 1 };
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
      done(null, { UDTime: 1411776900, medianTime: 1411776900, monetaryMass: 300, dividend: 100 });
    } else if (block.number == 81) {
      done(null, { UDTime: 1411776900, medianTime: 1411776900, monetaryMass: 3620, dividend: 110 });
    } else if (block.number == 82) {
      done(null, { UDTime: 1411777000, medianTime: 1411777000, monetaryMass: 3620, dividend: 110 });
    } else if (block.number == 83) {
      done(null, { UDTime: 1411777000, medianTime: 1411777000, monetaryMass: 3620, dividend: 110 });
    } else {
      done(null, null);
    }
  }

  this.existsUDSource = function (number, fpr, done) {
    var existing = [
      '46:F4A47E39BC2A20EE69DCD5CAB0A9EB3C92FD8F7B',
      '55:C3AE457BB31EA0B0DF811CF615E81CB46FEFDBE9'
    ];
    var exists = ~existing.indexOf([number, fpr].join(':')) ? true : false;
    done(null, exists);
  }

  this.existsTXSource = function (number, fpr, done) {
    var existing = [
      '4:D717FEC1993554F8EAE4CEA88DE5FBB6887CFAE8',
      '78:F80993776FB55154A60B3E58910C942A347964AD',
      '66:1D02FF8A7AE0037DF33F09C8750C0F733D61B7BD',
      '176:0651DE13A80EB0515A5D9F29E25D5D777152DE91',
      '88:B3052F06756154DC11033D4F3E1771AC30054E1F'
    ];
    var exists = ~existing.indexOf([number, fpr].join(':')) ? true : false;
    done(null, exists);
  }

  this.isAvailableUDSource = function (pubkey, number, fpr, amount, done) {
    var existing = [
      'HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY:D:46:F4A47E39BC2A20EE69DCD5CAB0A9EB3C92FD8F7B:40',
      '9WYHTavL1pmhunFCzUwiiq4pXwvgGG5ysjZnjz9H8yB:D:46:F4A47E39BC2A20EE69DCD5CAB0A9EB3C92FD8F7B:40'
    ];
    var isAvailable = ~existing.indexOf([pubkey, 'D', number, fpr, amount].join(':')) ? true : false;
    done(null, isAvailable);
  }

  this.isAvailableTXSource = function (pubkey, number, fpr, amount, done) {
    var existing = [
      'HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY:T:4:D717FEC1993554F8EAE4CEA88DE5FBB6887CFAE8:22',
      'HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY:T:78:F80993776FB55154A60B3E58910C942A347964AD:8',
      'CYYjHsNyg3HMRMpTHqCJAN9McjH5BwFLmDKGV3PmCuKp:T:66:1D02FF8A7AE0037DF33F09C8750C0F733D61B7BD:120',
      '9WYHTavL1pmhunFCzUwiiq4pXwvgGG5ysjZnjz9H8yB:T:176:0651DE13A80EB0515A5D9F29E25D5D777152DE91:5'
    ];
    var isAvailable = ~existing.indexOf([pubkey, 'T', number, fpr, amount].join(':')) ? true : false;
    done(null, isAvailable);
  }

  this.findBlock = function (number, hash, done) {
    if (number == 2 && hash == 'A9B751F5D24A3F418815BD9CE2766759E21E9E21')
      done(null, {});
    else if (number == 3 && hash == 'A9B751F5D24A3F418815BD9CE2766759E21E9E21')
      done(null, {});
    else if (number == 70 && hash == '3BAF425A914349B9681A444B5A2F59EEA55D2663')
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
  }

}
