var should = require('should');
var assert = require('assert');
var async  = require('async');
var nacl   = require('tweetnacl');
var scrypt = require('scrypt');

var SEED_LENGTH = 32; // Length of the ke
var TEST_PARAMS = {
  "N":4096,
  "r":16,
  "p":1
};

var enc = nacl.util.encodeBase64,
    dec = nacl.util.decodeBase64;

var b64sec = "TM0Imyj/ltqdtsNG7BFOD1uKMZ81q6Yk2oz27U+4pvs9QBfD6EOJWpK3CqdNG368nJgszy7ElozAzVXxKvRmDA==";
var b64sec = "6rcsdGAhF2rIltBRL+gwvQTQT7JMyei/d2JDrWoo0yzWSTM3HNaFd5LoXMiImAMhqZyu7OtTbhktK2UgQZSQ4A==";
var passphrase = 'This passphrase is supposed to be good enough for miniLock. :-)';
var salt = "miniLockScrypt..";
var pub, sec;

before(function (done) {
  // Generate the keypair
  getKeyPair(passphrase, salt, function (err, keyPair) {
    pub = keyPair.publicKey;
    sec = keyPair.secretKey;
    done();
  });
});

describe('ed25519 tests:', function(){

  it('good signature from existing secret key should be verified', function(done){
    var keys = nacl.sign.keyPair.fromSecretKey(dec("TM0Imyj/ltqdtsNG7BFOD1uKMZ81q6Yk2oz27U+4pvs9QBfD6EOJWpK3CqdNG368nJgszy7ElozAzVXxKvRmDA=="));
    var msg = dec("cg==");
    var goodSig = dec("kqAJqfDUyrhyDoILX2QlQKKye1QWUD+Ps3YiI+vbadoIWsHkPhWZbkWPNhPQ8R2MOHsurrQwKu6wDSkWErsMAA==");
    var sig = nacl.sign.detached(msg, keys.secretKey);
    enc(sig).should.equal(enc(goodSig));
    nacl.sign.detached.verify(msg, sig, keys.publicKey).should.be.true;
    done();
  });

  it('good signature from generated key should be verified', function(done){
    var msg = dec("Some message to be signed");
    var sig = nacl.sign.detached(msg, sec);
    var verified = nacl.sign.detached.verify(msg, sig, pub);
    verified.should.be.true;
    done();
  });

  it('wrong signature from generated key should NOT be verified', function(done){
    var msg = dec("Some message to be signed");
    var cor = dec(enc(msg) + 'delta');
    var sig = nacl.sign.detached(msg, sec);
    var verified = nacl.sign.detached.verify(cor, sig, pub);
    verified.should.be.false;
    done();
  });
});

/*****************************
   KEYPAIR GENERATION TOOLS
*****************************/

function getKeyPair(keyPhrase, saltPhrase, done) {
  getScryptKey(keyPhrase, saltPhrase, function(keyBytes) {
    done(null, nacl.sign.keyPair.fromSeed(keyBytes));
  });
}

function getScryptKey(key, salt, callback) {
  // console.log('Derivating the key...');
  scrypt.kdf.config.saltEncoding = "ascii";
  scrypt.kdf.config.keyEncoding = "ascii";
  scrypt.kdf.config.outputEncoding = "base64";
  scrypt.kdf(key, TEST_PARAMS, SEED_LENGTH, salt, function (err, res) {
    should.not.exist(err);
    callback(dec(res.hash));
  });
}
