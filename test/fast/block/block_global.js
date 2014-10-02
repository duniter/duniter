var async     = require('async');
var should    = require('should');
var assert    = require('assert');
var mongoose  = require('mongoose');
var parsers   = require('../../../app/lib/streams/parsers/doc');
var blocks    = require('../../data/blocks');
var validator = require('../../../app/lib/globalValidator');
var parser    = parsers.parseBlock();
var Block     = mongoose.model('Block', require('../../../app/models/block'));
var Identity  = mongoose.model('Identity', require('../../../app/models/identity'));

describe("Block local coherence", function(){

  it('a valid block should not have certification error', validate(blocks.VALID_ROOT, function (err, done) {
    should.not.exist(err);
    done();
  }));

  it('a block with certification of unknown pubkey should fail', validate(blocks.WRONGLY_SIGNED_CERTIFICATION, function (err, done) {
    should.exist(err);
    err.should.equal('Wrong signature for certification');
    done();
  }));

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
        validator(new BlockCheckerDao(block)).validate(block, next);
      },
      function (obj, next){
        validator(new BlockCheckerDao(block)).checkSignatures(block, next);
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
  
  this.getIdentityByPubkey = function (pubkey, done) {
    var i = 0;
    var found = false;
    while (!found && i < block.identities.length) {
      if (block.identities[i].match(new RegExp('^' + pubkey)))
        found = Identity.fromInline(block.identities[i]);
      i++;
    }
    done(null, found);
  }
}
