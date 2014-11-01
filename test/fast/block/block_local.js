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

  this.timeout(3000);

  it('a valid block should be well formatted', validate(blocks.VALID_ROOT, function (err, done) {
    should.not.exist(err);
    done();
  }));

  it('with correct leave should pass', validate(blocks.CORRECTLY_SIGNED_LEAVE, function (err, done) {
    assert.equal(err, 'Signature must match');
    done();
  }));

  describe("should be rejected", function(){

    it('block with wrong signature', validate(blocks.WRONG_SIGNATURE, function (err, done) {
      assert.equal(err, 'Signature must match');
      done();
    }));

    it('if root block has PreviousHash', validate(blocks.ROOT_WITH_PREVIOUS_HASH, function (err, done) {
      assert.equal(err, 'PreviousHash must not be provided for root block');
      done();
    }));

    it('if root block has PreviousIssuer', validate(blocks.ROOT_WITH_PREVIOUS_ISSUER, function (err, done) {
      assert.equal(err, 'PreviousIssuer must not be provided for root block');
      done();
    }));

    it('if root block has PreviousHash', validate(blocks.NON_ROOT_WITHOUT_PREVIOUS_HASH, function (err, done) {
      assert.equal(err, 'PreviousHash must be provided for non-root block');
      done();
    }));

    it('if root block has PreviousIssuer', validate(blocks.NON_ROOT_WITHOUT_PREVIOUS_ISSUER, function (err, done) {
      assert.equal(err, 'PreviousIssuer must be provided for non-root block');
      done();
    }));

    it('block with colliding uids in identities', validate(blocks.COLLIDING_UIDS, function (err, done) {
      assert.equal(err, 'Block must not contain twice same identity uid');
      done();
    }));

    it('a block with colliding pubkeys in identities', validate(blocks.COLLIDING_PUBKEYS, function (err, done) {
      assert.equal(err, 'Block must not contain twice same identity pubkey');
      done();
    }));

    it('a block with wrong date (in past)', validateWithoutSignatures(blocks.WRONG_DATE_LOWER, function (err, done) {
      assert.equal(err, 'A block must have its Date equal to ConfirmedDate or ConfirmedDate + dtDateMin');
      done();
    }));

    it('a block with wrong date (in future, but too close)', validateWithoutSignatures(blocks.WRONG_DATE_HIGHER_BUT_TOO_FEW, function (err, done) {
      assert.equal(err, 'A block must have its Date equal to ConfirmedDate or ConfirmedDate + dtDateMin');
      done();
    }));

    it('a block with wrong date (in future, but too far)', validateWithoutSignatures(blocks.WRONG_DATE_HIGHER_BUT_TOO_HIGH, function (err, done) {
      assert.equal(err, 'A block must have its Date equal to ConfirmedDate or ConfirmedDate + dtDateMin');
      done();
    }));

    it('a block with good date', validateWithoutSignatures(blocks.GOOD_DATE_HIGHER, function (err, done) {
      should.not.exist(err);
      done();
    }));

    it('a block with identities not matchin joins', validate(blocks.WRONG_IDTY_MATCH_JOINS, function (err, done) {
      assert.equal(err, 'Each identity must match a join membership line with same userid and certts');
      done();
    }));

    it('Block cannot contain a same pubkey more than once in joiners', validate(blocks.MULTIPLE_JOINS, function (err, done) {
      assert.equal(err, 'Block cannot contain a same pubkey more than once in joiners, leavers and excluded');
      done();
    }));

    it('Block cannot contain a same pubkey more than once in leavers', validate(blocks.MULTIPLE_LEAVES, function (err, done) {
      assert.equal(err, 'Block cannot contain a same pubkey more than once in joiners, leavers and excluded');
      done();
    }));

    it('Block cannot contain a same pubkey more than once in excluded', validate(blocks.MULTIPLE_EXCLUDED, function (err, done) {
      assert.equal(err, 'Block cannot contain a same pubkey more than once in joiners, leavers and excluded');
      done();
    }));

    it('Block cannot contain a same pubkey more than once in joiners, leavers and excluded', validate(blocks.MULTIPLE_OVER_ALL, function (err, done) {
      assert.equal(err, 'Block cannot contain a same pubkey more than once in joiners, leavers and excluded');
      done();
    }));

    it('Block cannot contain identical certifications', validate(blocks.IDENTICAL_CERTIFICATIONS, function (err, done) {
      assert.equal(err, 'Block cannot contain identical certifications (A -> B)');
      done();
    }));

    it('Block cannot contain certifications concerning a leaver', validate(blocks.LEAVER_WITH_CERTIFICATIONS, function (err, done) {
      assert.equal(err, 'Block cannot contain certifications concerning leavers or excluded members');
      done();
    }));

    it('Block cannot contain certifications concerning an excluded member', validate(blocks.EXCLUDED_WITH_CERTIFICATIONS, function (err, done) {
      assert.equal(err, 'Block cannot contain certifications concerning leavers or excluded members');
      done();
    }));

    it('Block cannot contain wrongly signed identities', validate(blocks.WRONGLY_SIGNED_IDENTITIES, function (err, done) {
      assert.equal(err, 'Identity\'s signature must match');
      done();
    }));

    it('Block cannot contain wrongly signed join', validate(blocks.WRONGLY_SIGNED_JOIN, function (err, done) {
      assert.equal(err, 'Membership\'s signature must match');
      done();
    }));

    it('Block cannot contain wrongly signed leave', validate(blocks.WRONGLY_SIGNED_LEAVE, function (err, done) {
      assert.equal(err, 'Membership\'s signature must match');
      done();
    }));

    it('Block cannot contain transactions with more or less indexes than issuers', validateTransactions(blocks.TRANSACTION_WITH_MORE_INDEXES_THAN_ISSUERS, function (err, done) {
      assert.equal(err, 'Number of indexes must be equal to number of issuers');
      done();
    }));

    it('Block cannot contain transactions with issuers not spending coins', validateTransactions(blocks.TRANSACTION_WITH_UNMATCHING_INDEX, function (err, done) {
      assert.equal(err, 'Each issuer must be present in sources');
      done();
    }));

    it('Block cannot contain transactions with input sum different from output sum', validateTransactions(blocks.TRANSACTION_WITH_DIFFERENT_INPUT_OUTPUT_SUMS, function (err, done) {
      assert.equal(err, 'Input sum and output sum must be equal');
      done();
    }));

    it('Block cannot contain transactions with identical sources in one transaction', validateTransactions(blocks.TRANSACTION_WITH_DUPLICATED_SOURCE_SINGLE_TX, function (err, done) {
      assert.equal(err, 'It cannot exist 2 identical sources inside a transaction');
      done();
    }));

    it('Block cannot contain transactions with identical outputs in one transaction', validateTransactions(blocks.TRANSACTION_WITH_DUPLICATED_RECIPIENTS_SINGLE_TX, function (err, done) {
      assert.equal(err, 'It cannot exist 2 identical recipients inside a transaction');
      done();
    }));

    it('Block cannot contain transactions with identical sources in a pack of transactions', validateTransactions(blocks.TRANSACTION_WITH_DUPLICATED_SOURCE_MULTIPLE_TX, function (err, done) {
      assert.equal(err, 'It cannot exist 2 identical sources for transactions inside a given block');
      done();
    }));

    it('Block cannot contain transactions with wrong signatures', validateTransactionsSignature(blocks.TRANSACTION_WITH_WRONG_SIGNATURES, function (err, done) {
      assert.equal(err, 'Signature from a transaction must match');
      done();
    }));
  });
  
});

function validate (raw, callback) {
  var block;
  return function (done) {
    async.waterfall([
      function (next){
        parser.asyncWrite(raw, next);
      },
      function (obj, next){
        block = new Block(obj);
        localValidator(conf).validate(block, next);
      },
      function (obj, next){
        localValidator(conf).checkSignatures(block, next);
      },
    ], function (err) {
      callback(err, done);
    });
  };
}

function validateWithoutSignatures (raw, callback) {
  var block;
  return function (done) {
    async.waterfall([
      function (next){
        parser.asyncWrite(raw, next);
      },
      function (obj, next){
        block = new Block(obj);
        localValidator(conf).validate(block, next);
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
