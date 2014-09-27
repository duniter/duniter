var async     = require('async');
var should    = require('should');
var assert    = require('assert');
var mongoose  = require('mongoose');
var parsers   = require('../../../app/lib/streams/parsers/doc');
var blocks    = require('../../data/blocks');
var validator = require('../../../app/lib/localValidator');
var parser    = parsers.parseBlock();
var Block     = mongoose.model('Block', require('../../../app/models/block'));

describe("Block local coherence", function(){

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

    it('block with colliding uids in identities', validate(blocks.COLLIDING_UIDS, function (err, done) {
      assert.equal(err, 'Block must not contain twice same identity uid');
      done();
    }));

    it('a block with colliding pubkeys in identities', validate(blocks.COLLIDING_PUBKEYS, function (err, done) {
      assert.equal(err, 'Block must not contain twice same identity pubkey');
      done();
    }));

    it('a block with wrong date', validate(blocks.WRONG_DATE, function (err, done) {
      assert.equal(err, 'A block must have its Date greater or equal to ConfirmedDate');
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
        validator().validate(block, next);
      },
      function (obj, next){
        validator().checkSignatures(block, next);
      },
    ], function (err) {
      callback(err, done);
    });
  };
}
