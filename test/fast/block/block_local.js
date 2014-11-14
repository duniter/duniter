var async          = require('async');
var should         = require('should');
var assert         = require('assert');
var mongoose       = require('mongoose');
var parsers        = require('../../../app/lib/streams/parsers/doc');
var blocks         = require('../../data/blocks');
var localValidator = require('../../../app/lib/localValidator');
var parser         = parsers.parseBlock();
var Block          = mongoose.model('Block', require('../../../app/models/block'));
var Configuration  = mongoose.model('Configuration', require('../../../app/models/configuration'));

var conf = new Configuration({
  sigDelay: 365.25*24*3600, // 1 year
  sigQty: 1,
  powZeroMin: 1,
  powPeriod: 18,
  incDateMin: 10,
  dtDateMin: 60,
  dt: 100,
  ud0: 100,
  c: 0.1
});

describe("Block local coherence", function(){

  it('a valid block should be well formatted', test('validateWithoutSignatures', blocks.VALID_ROOT, function (err, done) {
    should.not.exist(err);
    done();
  }));

  // it.only('with correct leave should pass', validateWithoutSignatures(blocks.CORRECTLY_SIGNED_LEAVE, function (err, done) {
  //   assert.equal(err, 'Signature must match');
  //   done();
  // }));

  describe("should be rejected", function(){

    it('if wrong signature block', test('checkBlockSignature', blocks.WRONG_SIGNATURE, function (err, done) {
      assert.equal(err, 'Block\'s signature must match');
      done();
    }));

    it('if root block does not have Parameters', test('checkParameters', blocks.ROOT_WITHOUT_PARAMETERS, function (err, done) {
      assert.equal(err, 'Parameters must be provided for root block');
      done();
    }));

    it('if non-root has Parameters', test('checkParameters', blocks.NON_ROOT_WITH_PARAMETERS, function (err, done) {
      assert.equal(err, 'Parameters must not be provided for non-root block');
      done();
    }));

    it('if root block has PreviousHash', test('checkPreviousHash', blocks.ROOT_WITH_PREVIOUS_HASH, function (err, done) {
      assert.equal(err, 'PreviousHash must not be provided for root block');
      done();
    }));

    it('if root block has PreviousIssuer', test('checkPreviousIssuer', blocks.ROOT_WITH_PREVIOUS_ISSUER, function (err, done) {
      assert.equal(err, 'PreviousIssuer must not be provided for root block');
      done();
    }));

    it('if non-root block does not have PreviousHash', test('checkPreviousHash', blocks.NON_ROOT_WITHOUT_PREVIOUS_HASH, function (err, done) {
      assert.equal(err, 'PreviousHash must be provided for non-root block');
      done();
    }));

    it('if non-root block does not have PreviousIssuer', test('checkPreviousIssuer', blocks.NON_ROOT_WITHOUT_PREVIOUS_ISSUER, function (err, done) {
      assert.equal(err, 'PreviousIssuer must be provided for non-root block');
      done();
    }));

    it('a block with wrong date (in past)', test('checkBlockDates', blocks.WRONG_DATE_LOWER, function (err, done) {
      assert.equal(err, 'A block must have its Date equal to ConfirmedDate or ConfirmedDate + dtDateMin');
      done();
    }));

    it('a block with wrong date (in future, but too close)', test('checkBlockDates', blocks.WRONG_DATE_HIGHER_BUT_TOO_FEW, function (err, done) {
      assert.equal(err, 'A block must have its Date equal to ConfirmedDate or ConfirmedDate + dtDateMin');
      done();
    }));

    it('a block with wrong date (in future, but too far)', test('checkBlockDates', blocks.WRONG_DATE_HIGHER_BUT_TOO_HIGH, function (err, done) {
      assert.equal(err, 'A block must have its Date equal to ConfirmedDate or ConfirmedDate + dtDateMin');
      done();
    }));

    it('a block with good date', test('checkBlockDates', blocks.GOOD_DATE_HIGHER, function (err, done) {
      should.not.exist(err);
      done();
    }));

    it('Block cannot contain wrongly signed identities', test('checkIdentitiesSignature', blocks.WRONGLY_SIGNED_IDENTITIES, function (err, done) {
      assert.equal(err, 'Identity\'s signature must match');
      done();
    }));

    it('block with colliding uids in identities', test('checkIdentitiesUserIDConflict', blocks.COLLIDING_UIDS, function (err, done) {
      assert.equal(err, 'Block must not contain twice same identity uid');
      done();
    }));

    it('a block with colliding pubkeys in identities', test('checkIdentitiesPubkeyConflict', blocks.COLLIDING_PUBKEYS, function (err, done) {
      assert.equal(err, 'Block must not contain twice same identity pubkey');
      done();
    }));

    it('a block with identities not matchin joins', test('checkIdentitiesMatchJoin', blocks.WRONG_IDTY_MATCH_JOINS, function (err, done) {
      assert.equal(err, 'Each identity must match a newcomer line with same userid and certts');
      done();
    }));

    it('Block cannot contain wrongly signed join', test('checkMembershipsSignature', blocks.WRONGLY_SIGNED_JOIN, function (err, done) {
      assert.equal(err, 'Membership\'s signature must match');
      done();
    }));

    it('Block cannot contain wrongly signed active', test('checkMembershipsSignature', blocks.WRONGLY_SIGNED_ACTIVE, function (err, done) {
      assert.equal(err, 'Membership\'s signature must match');
      done();
    }));

    it('Block cannot contain wrongly signed leave', test('checkMembershipsSignature', blocks.WRONGLY_SIGNED_LEAVE, function (err, done) {
      assert.equal(err, 'Membership\'s signature must match');
      done();
    }));

    it('Block cannot contain a same pubkey more than once in joiners', test('checkPubkeyUnicity', blocks.MULTIPLE_JOINERS, function (err, done) {
      assert.equal(err, 'Block cannot contain a same pubkey more than once in joiners, actives, leavers and excluded');
      done();
    }));

    it('Block cannot contain a same pubkey more than once in actives', test('checkPubkeyUnicity', blocks.MULTIPLE_ACTIVES, function (err, done) {
      assert.equal(err, 'Block cannot contain a same pubkey more than once in joiners, actives, leavers and excluded');
      done();
    }));

    it('Block cannot contain a same pubkey more than once in leavers', test('checkPubkeyUnicity', blocks.MULTIPLE_LEAVES, function (err, done) {
      assert.equal(err, 'Block cannot contain a same pubkey more than once in joiners, actives, leavers and excluded');
      done();
    }));

    it('Block cannot contain a same pubkey more than once in excluded', test('checkPubkeyUnicity', blocks.MULTIPLE_EXCLUDED, function (err, done) {
      assert.equal(err, 'Block cannot contain a same pubkey more than once in joiners, actives, leavers and excluded');
      done();
    }));

    it('Block cannot contain a same pubkey more than once in joiners, actives, leavers and excluded', test('checkPubkeyUnicity', blocks.MULTIPLE_OVER_ALL, function (err, done) {
      assert.equal(err, 'Block cannot contain a same pubkey more than once in joiners, actives, leavers and excluded');
      done();
    }));

    it('Block cannot contain identical certifications', test('checkCertificationUnicity', blocks.IDENTICAL_CERTIFICATIONS, function (err, done) {
      assert.equal(err, 'Block cannot contain identical certifications (A -> B)');
      done();
    }));

    it('Block cannot contain certifications concerning a leaver', test('checkCertificationIsntForLeaverOrExcluded', blocks.LEAVER_WITH_CERTIFICATIONS, function (err, done) {
      assert.equal(err, 'Block cannot contain certifications concerning leavers or excluded members');
      done();
    }));

    it('Block cannot contain certifications concerning an excluded member', test('checkCertificationIsntForLeaverOrExcluded', blocks.EXCLUDED_WITH_CERTIFICATIONS, function (err, done) {
      assert.equal(err, 'Block cannot contain certifications concerning leavers or excluded members');
      done();
    }));

    it('Block cannot contain transactions without issuers', test('checkTxIssuers', blocks.TRANSACTION_WITHOUT_ISSUERS, function (err, done) {
      assert.equal(err, 'A transaction must have at least 1 issuer');
      done();
    }));

    it('Block cannot contain transactions without issuers', test('checkTxSources', blocks.TRANSACTION_WITHOUT_SOURCES, function (err, done) {
      assert.equal(err, 'A transaction must have at least 1 source');
      done();
    }));

    it('Block cannot contain transactions without issuers', test('checkTxRecipients', blocks.TRANSACTION_WITHOUT_RECIPIENT, function (err, done) {
      assert.equal(err, 'A transaction must have at least 1 recipient');
      done();
    }));

    it('Block cannot contain transactions with issuers not spending coins', test('checkTxIndexes', blocks.TRANSACTION_WITH_UNMATCHING_INDEX, function (err, done) {
      assert.equal(err, 'Each issuer must be present in sources');
      done();
    }));

    it('Block cannot contain transactions with more or less indexes than issuers', test('checkTxIndexes', blocks.TRANSACTION_WITH_MORE_INDEXES_THAN_ISSUERS, function (err, done) {
      assert.equal(err, 'Number of indexes must be equal to number of issuers');
      done();
    }));

    it('Block cannot contain transactions with identical sources in one transaction', test('checkTxSources', blocks.TRANSACTION_WITH_DUPLICATED_SOURCE_SINGLE_TX, function (err, done) {
      assert.equal(err, 'It cannot exist 2 identical sources for transactions inside a given block');
      done();
    }));

    it('Block cannot contain transactions with identical sources in a pack of transactions', test('checkTxSources', blocks.TRANSACTION_WITH_DUPLICATED_SOURCE_MULTIPLE_TX, function (err, done) {
      assert.equal(err, 'It cannot exist 2 identical sources for transactions inside a given block');
      done();
    }));

    it('Block cannot contain transactions with identical outputs in one transaction', test('checkTxRecipients', blocks.TRANSACTION_WITH_DUPLICATED_RECIPIENTS_SINGLE_TX, function (err, done) {
      assert.equal(err, 'It cannot exist 2 identical recipients inside a transaction');
      done();
    }));

    it('Block cannot contain transactions with input sum different from output sum', test('checkTxSums', blocks.TRANSACTION_WITH_DIFFERENT_INPUT_OUTPUT_SUMS, function (err, done) {
      assert.equal(err, 'Input sum and output sum must be equal');
      done();
    }));

    it('Block cannot contain transactions with wrong signatures', test('checkTxSignature', blocks.TRANSACTION_WITH_WRONG_SIGNATURES, function (err, done) {
      assert.equal(err, 'Signature from a transaction must match');
      done();
    }));
  });
  
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
        localValidator(conf)[funcName](block, next);
      },
    ], function (err) {
      callback(err, done);
    });
  };
}

function testTx (funcName, raw, callback) {
  var block;
  return function (done) {
    async.waterfall([
      function (next){
        parser.asyncWrite(raw, next);
      },
      function (obj, next){
        block = new Block(obj);
        localValidator(conf)[funcName](block, next);
      },
    ], function (err) {
      callback(err, done);
    });
  };
}

function validateTransactions (raw, callback) {
  var block;
  return function (done) {
    async.waterfall([
      function (next){
        parser.asyncWrite(raw, next);
      },
      function (obj, next){
        block = new Block(obj);
        localValidator(conf).checkTransactionsOfBlock(block, next);
      },
    ], function (err) {
      callback(err, done);
    });
  };
}

function validateTransactionsSignature (raw, callback) {
  var block;
  return function (done) {
    async.waterfall([
      function (next){
        parser.asyncWrite(raw, next);
      },
      function (obj, next){
        block = new Block(obj);
        localValidator(conf).checkTransactionsOfBlock(block, next);
      },
      function (next){
        localValidator(conf).checkTransactionsSignature(block, next);
      },
    ], function (err) {
      callback(err, done);
    });
  };
}
