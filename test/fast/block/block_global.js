var async         = require('async');
var should        = require('should');
var assert        = require('assert');
var mongoose      = require('mongoose');
var parsers       = require('../../../app/lib/streams/parsers/doc');
var blocks        = require('../../data/blocks');
var validator     = require('../../../app/lib/globalValidator');
var parser        = parsers.parseBlock();
var Block         = mongoose.model('Block', require('../../../app/models/block'));
var Identity      = mongoose.model('Identity', require('../../../app/models/identity'));
var Configuration = mongoose.model('Configuration', require('../../../app/models/configuration'));

var conf = new Configuration({
  sigDelay: 365.25*24*3600, // 1 year
  sigQty: 1
});

describe("Block global coherence", function(){

  it('a valid block should not have any error', validate(blocks.VALID_ROOT, function (err, done) {
    should.not.exist(err);
    done();
  }));

  it('a block with certification of unknown pubkey should fail', validate(blocks.WRONGLY_SIGNED_CERTIFICATION, function (err, done) {
    should.exist(err);
    err.should.equal('Wrong signature for certification');
    done();
  }));

  it('a block with certification from non-member pubkey should fail', validate(blocks.UNKNOWN_CERTIFIER, function (err, done) {
    should.exist(err);
    err.should.equal('Certification from non-member');
    done();
  }));

  it('a block with certification to non-member pubkey should fail', validate(blocks.UNKNOWN_CERTIFIED, function (err, done) {
    should.exist(err);
    err.should.equal('Certification to non-member');
    done();
  }));

  it('a block with already used UserID should fail', validate(blocks.EXISTING_UID, function (err, done) {
    should.exist(err);
    err.should.equal('Identity already used');
    done();
  }));

  it('a block with already used pubkey should fail', validate(blocks.EXISTING_PUBKEY, function (err, done) {
    should.exist(err);
    err.should.equal('Pubkey already used');
    done();
  }));

  it('a block with too early certification replay should fail', validate(blocks.TOO_EARLY_CERTIFICATION_REPLAY, function (err, done) {
    should.exist(err);
    err.should.equal('Too early for this certification');
    done();
  }));

  it('a block with at least one joiner without enough certifications should fail', validate(blocks.NOT_ENOUGH_CERTIFICATIONS_JOINER, function (err, done) {
    should.exist(err);
    err.should.equal('Joiner does not gathers enough certifications');
    done();
  }));

  it('a block with at least one joiner outdistanced from WoT should fail', validate(blocks.OUTDISTANCED_JOINER, function (err, done) {
    should.exist(err);
    err.should.equal('Joiner is outdistanced from WoT');
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
        validator(conf, new BlockCheckerDao(block)).validate(block, next);
      },
      function (obj, next){
        validator(conf, new BlockCheckerDao(block)).checkSignatures(block, next);
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
    done(null, null);
  }
  
  this.isMember = function (pubkey, done) {
    // No existing member
    if (block.number == 0)
      done(null, false);
    else {
      var members = [
        'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
        'G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU',
      ];
      done(null, ~members.indexOf(pubkey));
    }
  }

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

}
