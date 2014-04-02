var should    = require('should');
var assert    = require('assert');
var mongoose  = require('mongoose');
var sha1      = require('sha1');
var signatory = require('./tool/signatory');
var openpgp   = require('../app/lib/openpgp').openpgp;
var fs        = require('fs');
var gnupg     = require('../app/lib/gnupg');
var jpgp      = require('../app/lib/jpgp');
var async     = require('async');
var common    = require('../app/lib/common');

var catRawKey = fs.readFileSync(__dirname + "/data/lolcat.priv", 'utf8');
var catRawPubKey = fs.readFileSync(__dirname + "/data/lolcat.pub", 'utf8');
var catPasswd = "lolcat";
var cat = signatory(catRawKey, catPasswd);
// var catPrivateKey = openpgp.read_privateKey(catRawKey, catPasswd)[0];

var gnupg = new gnupg(catRawKey, catPasswd, "testring");

openpgp.init();
openpgp.keyring.importPrivateKey(catRawKey, catPasswd);

var catPrivateKey = openpgp.keyring.privateKeys[0];

describe('Simple line signature:', function(){

  before(function (done) {
    gnupg.init(done);
  });

  var message = "This is lolcat";

  it('jpgp.sign() should be verified', function(done){
    async.waterfall([
      async.apply(jpgp().sign, message, catPrivateKey),
      async.apply(verify, message, catRawPubKey),
    ], testVerified(true, done));
  });

  it('jpgp.sign() must NOT be verified with wrong data', function(done){
    async.waterfall([
      async.apply(jpgp().sign, message, catPrivateKey),
      async.apply(verify, message + "some delta", catRawPubKey),
    ], testVerified(false, done));
  });

  //-----------------------------
  // gnupg.js test

  it('jpgp.verify() should verify gnupg.js --clearsign signature', function(done){
    async.waterfall([
      async.apply(gnupg.clearsign, message),
      async.apply(verify, message, catRawPubKey),
    ], testVerified(true, done));
  });

  it('jpgp.verify() should verify gnupg.js -sba signature', function(done){
    async.waterfall([
      async.apply(gnupg.sign, message),
      async.apply(verify, message, catRawPubKey),
    ], testVerified(true, done));
  });

  //-----------------------------
  // Some pre-signed stuff here

  var message2     = fs.readFileSync(__dirname + "/data/aa", 'utf8');
  var signature   = fs.readFileSync(__dirname + "/data/aa.asc", 'utf8');
  var messageCRLF = fs.readFileSync(__dirname + "/data/aa.dos", 'utf8');

  it('jpgp.verify() must NOT verify external gpg signature + CRLF line ending', function(done){
    verify(message2.dos2unix(), catRawPubKey, signature, testVerified(false, done));
  });

  it('jpgp.verify() must verify external gpg signature + LF line ending', function(done){
    verify(message2.unix2dos(), catRawPubKey, signature, testVerified(true, done));
  });

  it('jpgp.verify() must verify external gpg signature + CRLF line ending file', function(done){
    verify(messageCRLF, catRawPubKey, signature, testVerified(true, done));
  });

  it('jpgp.verify() must NOT verify external gpg signature + CRLF line ending file', function(done){
    verify(messageCRLF.dos2unix(), catRawPubKey, signature, testVerified(false, done));
  });

  it('jpgp.verify() must NOT pass external gpg signature + wrong data', function(done){
    verify(message2 + "some delta", catRawPubKey, signature, testVerified(false, done));
  });
});

describe('Multiline message signature:', function(){

  var amendment = fs.readFileSync(__dirname + "/data/amendments/BB-AM0-OK", 'utf8');

  before(function (done) {
    gnupg.init(done);
  });

  it('jpgp.sign() should be verified', function(done){
    async.waterfall([
      async.apply(jpgp().sign, amendment, catPrivateKey),
      async.apply(verify, amendment, catRawPubKey),
    ], testVerified(true, done));
  });

  it('jpgp.sign() must NOT be verified with wrong data', function(done){
    async.waterfall([
      async.apply(jpgp().sign, amendment, catPrivateKey),
      async.apply(verify, amendment + "some delta", catRawPubKey),
    ], testVerified(false, done));
  });

  //-----------------------------
  // gnupg.js test

  // TODO: this test do not pass, however it should (gpg does attest it)
  // it('jpgp.verify() should verify gnupg.js --clearsign signature', function(done){
  //   async.waterfall([
  //     async.apply(gnupg.clearsign, amendment),
  //     async.apply(verify, amendment, catRawPubKey),
  //   ], testVerified(true, done));
  // });

  it('jpgp.verify() should verify gnupg.js -sba signature', function(done){
    async.waterfall([
      async.apply(gnupg.sign, amendment),
      async.apply(verify, amendment, catRawPubKey),
    ], testVerified(true, done));
  });
});

describe('Public key message signature:', function(){

  var amendment = fs.readFileSync(__dirname + "/data/lolcat.pub", 'utf8');

  before(function (done) {
    gnupg.init(done);
  });

  it('jpgp.sign() should NOT be verified (bug in openpgpjs lib)', function(done){
    async.waterfall([
      async.apply(jpgp().sign, amendment, catPrivateKey),
      async.apply(verify, amendment, catRawPubKey),
    ], testVerified(false, done));
  });

  it('jpgp.sign() must NOT be verified with wrong data', function(done){
    async.waterfall([
      async.apply(jpgp().sign, amendment, catPrivateKey),
      async.apply(verify, amendment + "some delta", catRawPubKey),
    ], testVerified(false, done));
  });

  //-----------------------------
  // gnupg.js test

  // TODO: this test do not pass, however it should (gpg does attest it)
  // it('jpgp.verify() should verify gnupg.js --clearsign signature', function(done){
  //   async.waterfall([
  //     async.apply(gnupg.clearsign, amendment),
  //     async.apply(verify, amendment, catRawPubKey),
  //   ], testVerified(true, done));
  // });

  it('jpgp.verify() should verify gnupg.js -sba signature', function(done){
    async.waterfall([
      async.apply(gnupg.sign, amendment),
      async.apply(verify, amendment, catRawPubKey),
    ], testVerified(true, done));
  });
});

function testVerified (isTrue, done) {
  return function (err, verified) {
    assert.equal(isTrue, verified);
    if (isTrue)
      should.not.exist(err);
    else
      should.exist(err);
    done();
  };
}

function verify (message, pubkey, signature, done) {
  jpgp()
    .publicKey(pubkey)
    .data(message)
    .signature(signature)
    .verify(done);
}