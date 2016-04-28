"use strict";
var should = require('should');
var async  = require('async');
var nacl   = require('tweetnacl');
var base58 = require('../../../app/lib/base58');
var crypto      = require('../../../app/lib/crypto');

var enc = nacl.util.encodeBase64,
    dec = nacl.util.decodeBase64;

var passphrase = "abc";
var salt = "abc";
var pub, sec, rawPub, rawSec;

before(function (done) {
  // Generate the keypair
  crypto.getKeyPair(salt, passphrase, function (err, keyPair) {
    pub = keyPair.publicKey;
    sec = keyPair.secretKey;
    rawPub = base58.encode(pub);
    rawSec = base58.encode(sec);
    done();
  });
});

describe('ed25519 tests:', function(){

  //it('good signature from existing secret key should be verified', function(done){
  //  var keys = nacl.sign.keyPair.fromSecretKey(dec("TM0Imyj/ltqdtsNG7BFOD1uKMZ81q6Yk2oz27U+4pvs9QBfD6EOJWpK3CqdNG368nJgszy7ElozAzVXxKvRmDA=="));
  //  var msg = "cg==";
  //  var goodSig = dec("52Hh9omo9rxklulAE7gvVeYvAq0GgXYoZE2NB/gzehpCYIT04bMcGIs5bhYLaH93oib34jsVMWs9Udadr1B+AQ==");
  //  var sig = crypto.signSync(msg, keys.secretKey);
  //  sig.should.equal(enc(goodSig));
  //  crypto.verify(msg, sig, enc(keys.publicKey)).should.be.true;
  //  done();
  //});

  it('good signature from generated key should be verified', function(done){
    var msg = "Some message to be signed";
    var sig = crypto.signSync(msg, sec);
    var verified = crypto.verify(msg, sig, rawPub);
    verified.should.be.true;
    done();
  });

  it('wrong signature from generated key should NOT be verified', function(done){
    var msg = "Some message to be signed";
    var cor = dec(enc(msg) + 'delta');
    var sig = crypto.signSync(msg, sec);
    var verified = crypto.verify(cor, sig, rawPub);
    verified.should.be.false;
    done();
  });
});
