var should    = require('should');
var assert    = require('assert');
var mongoose  = require('mongoose');
var sha1      = require('sha1');
var signatory = require('./../tool/signatory');
var openpgp   = require('openpgp');
var fs        = require('fs');
var gnupg     = require('../../app/lib/gnupg');
var jpgp      = require('../../app/lib/jpgp');
var async     = require('async');
var common    = require('../../app/lib/common');
var nacl      = require('tweetnacl');
// var scrypt    = require('../../app/lib/scrypt');
var blake2s   = require('../../app/lib/blake2s');

var scrypt = require('scrypt');
scrypt.kdf.config.saltEncoding = "ascii";
scrypt.kdf.config.keyEncoding = "ascii";

var enc = nacl.util.encodeBase64,
    dec = nacl.util.decodeBase64;

var b64sec = "TM0Imyj/ltqdtsNG7BFOD1uKMZ81q6Yk2oz27U+4pvs9QBfD6EOJWpK3CqdNG368nJgszy7ElozAzVXxKvRmDA==";
var b64sec = "6rcsdGAhF2rIltBRL+gwvQTQT7JMyei/d2JDrWoo0yzWSTM3HNaFd5LoXMiImAMhqZyu7OtTbhktK2UgQZSQ4A==";
var passphrase = 'This passphrase is supposed to be good enough for miniLock. :-)';
var salt = "miniLockScrypt..";
var pub, sec;

describe('ed25519 tests:', function(){

  this.timeout(15000);

  before(function (done) {
    // var keyPair = nacl.sign.keyPair.fromSecretKey(dec(b64sec));
    // pub = keyPair.publicKey;
    // sec = keyPair.secretKey;
    // console.log('');
    // console.log(b64sec);
    // console.log(enc(sec));
    // assert.equal(enc(sec), b64sec);
    // done();
    getKeyPair(passphrase, salt, function (err, keyPair) {
      pub = keyPair.publicKey;
      sec = keyPair.secretKey;
      done();
    });
  });

  it('good signature should be verified', function(done){
    var keys = nacl.sign.keyPair.fromSecretKey(dec("TM0Imyj/ltqdtsNG7BFOD1uKMZ81q6Yk2oz27U+4pvs9QBfD6EOJWpK3CqdNG368nJgszy7ElozAzVXxKvRmDA=="));
    var msg = dec("cg==");
    var goodSig = dec("kqAJqfDUyrhyDoILX2QlQKKye1QWUD+Ps3YiI+vbadoIWsHkPhWZbkWPNhPQ8R2MOHsurrQwKu6wDSkWErsMAA==");

    var sig = nacl.sign.detached(msg, keys.secretKey);
    assert.equal(enc(sig), enc(goodSig));

    // Verify
    var result = nacl.sign.detached.verify(msg, sig, keys.publicKey);
    result.should.be.true;
    verify(msg, keys.publicKey, sig, testVerified(true, done));
  });

  it('good signature should be verified 2', function(done){
    var keys = nacl.sign.keyPair.fromSecretKey(dec("/bq+HJ00cgB4VucZDQHp/nxq18vII3gw53N2Y0s3MWIurzDZLiKjiG/xCSedmDDaxyevuUqD7m2DYMvfoswGQA=="));
    var message = 'some message';
    var msg = dec("cg==");
    // var msg = nacl.util.decodeUTF8(message);
    var sig = nacl.sign.detached(msg, keys.secretKey);
    // var sig = nacl.sign.detached(msg, sec);
    // var verified = nacl.sign.detached.verify(msg, sig, pub);
    var result = nacl.sign.detached.verify(msg, sig, keys.publicKey);
    result.should.be.true;
    // verified.should.be.true;
    done();
    // var message = 'some message';
    // var utf8msg = nacl.util.decodeUTF8(message);
    // var sig = sign(utf8msg, sec);
    // verify(utf8msg, pub, sig, testVerified(true, done));
  });
});

function testVerified (isTrue, errString, done) {
  if (arguments.length == 2) {
    done = errString;
    errString = undefined;
  }
  return function (err, verified) {
    isTrue ? verified.should.be.true : verified.should.be.false;
    isTrue ? should.not.exist(err) : should.exist(err);
    if (errString) {
      err.toString().should.equal(errString);
    }
    done();
  };
}

function sign (msg, sec, done) {
  var signature = nacl.sign.detached(msg, sec);
  if (typeof done == 'function') done(null, signature);
  return signature;
}

function verify (msg, pub, sig, done) {
  var verified = nacl.sign.detached.verify(msg, sig, pub);
  if (typeof done == 'function') done(null, verified);
  return verified;
}

function getScryptKey(key, salt, callback) {
  console.log('getScryptKey...');
  // callback(scrypt(nacl.util.decodeUTF8(key), nacl.util.decodeUTF8(salt), 1024, 8, 1));
  //Synchronous
  var res = scrypt.kdf("password",{"N":1024,"r":8,"p":16},64,"NaCl");
  console.log(res);
  console.log(res.hash.toString("base64"));
  console.log(res.hash.toString("hex"));
  callback(dec(res.hash.toString("base64")));
}


function getKeyPair(keyPhrase, salt, done) {
  getScryptKey(keyPhrase, salt, function(keyBytes) {
    console.log(enc(keyBytes));
    done(null, nacl.sign.keyPair.fromSecretKey(keyBytes));
  })
}


// function getKeyPair(keyPhrase, salt, done) {
//   var keyHash = new blake2s(32)
//   keyHash.update(nacl.util.decodeUTF8(keyPhrase))
//   salt = nacl.util.decodeUTF8(salt)
//   getScryptKey(keyHash.digest(), salt, function(keyBytes) {
//     console.log(enc(keyBytes));
//     done(null, nacl.sign.keyPair.fromSecretKey(keyBytes));
//   })
// }



// function getKeyPair(keyPhrase, salt, done) {
//   var keyHash = new blake2s(32)
//   keyHash.update(nacl.util.decodeUTF8(keyPhrase))
//   salt = nacl.util.decodeUTF8(salt)
//   getScryptKey(keyHash.digest(), salt, function(keyBytes) {
//     console.log(enc(keyBytes));
//     done(null, nacl.sign.keyPair.fromSecretKey(keyBytes));
//   })
// }
