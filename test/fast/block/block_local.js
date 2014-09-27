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
