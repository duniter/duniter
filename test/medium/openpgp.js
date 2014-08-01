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

var catRawKey           = fs.readFileSync(__dirname + "/../data/lolcat.priv",               'utf8');
var catRawPubKey        = fs.readFileSync(__dirname + "/../data/lolcat.pub",                'utf8');
var catRawRevokedPubKey = fs.readFileSync(__dirname + "/../data/lolcat.pub.revoked",        'utf8');
var catRawRevokedSubKey = fs.readFileSync(__dirname + "/../data/lolcat.pub.revoked.subkey", 'utf8');
var catSubkeySignedMess = fs.readFileSync(__dirname + "/../data/openpgp/message.txt",       'utf8');
var catSubkeySignedSign = fs.readFileSync(__dirname + "/../data/openpgp/message.txt.asc",   'utf8');
var catPasswd = "lolcat";
var cat = signatory(catRawKey, catPasswd);
// var catPrivateKey = openpgp.read_privateKey(catRawKey, catPasswd)[0];

var gnupg = new gnupg(catRawKey, catPasswd, "C73882B64B7E72237A2F460CE9CAB76D19A8651E", "testring");

var catPrivateKey = openpgp.key.readArmored(catRawKey).keys[0];
catPrivateKey.decrypt(catPasswd);

describe('Simple line signature:', function(){

  before(function (done) {
    gnupg.init(done);
  });

  var message = "This is lolcat";

  it('should handle basic openpgp.js test', function(done){
    async.waterfall([
      function (next){
        openpgp.signClearMessage([catPrivateKey], 'yeah', function (err, signature) {
          should.not.exist(err);
          should.exist(signature);
          signature.should.match(/-----BEGIN PGP SIGNED MESSAGE-----/);
          next(err, signature);
        });
      },
      function (sig, next){
        var clearTextMessage = openpgp.cleartext.readArmored(sig);
        openpgp.verifyClearSignedMessage([catPrivateKey.toPublic()], clearTextMessage, function (err, res) {
          should.not.exist(err);
          should.exist(res);
          should.exist(res.text);
          should.exist(res.signatures);
          should.exist(res.signatures[0]);
          should.exist(res.signatures[0].keyid);
          should.exist(res.signatures[0].keyid.bytes);
          should.exist(res.signatures[0].valid);
          res.signatures[0].keyid.bytes.hexstrdump().toUpperCase().should.equal('E9CAB76D19A8651E');
          res.signatures[0].valid.should.be.true;
          next(err);
        });
      },
    ], done);
  });

  it('but not with revoked pubkey', function(done){
    async.waterfall([
      async.apply(jpgp().sign, message, catPrivateKey),
      async.apply(verify, message, catRawRevokedPubKey),
    ], testVerified(false, 'Key has been revoked', done));
  });

  it('but not with revoked subkey', function(done){
    async.waterfall([
      async.apply(verify, catSubkeySignedMess, catRawRevokedSubKey, catSubkeySignedSign),
    ], testVerified(false, 'SubKey has been revoked', done));
  });


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

  var message2     = fs.readFileSync(__dirname + "/../data/aa", 'utf8');
  var signature   = fs.readFileSync(__dirname + "/../data/aa.asc", 'utf8');
  var messageCRLF = fs.readFileSync(__dirname + "/../data/aa.dos", 'utf8');

  it('jpgp.verify() must NOT verify external gpg signature + LF line ending', function(done){
    verify(message2.dos2unix(), catRawPubKey, signature, testVerified(false, done));
  });

  it('jpgp.verify() must verify external gpg signature + CRLF line ending', function(done){
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

  var amendment = "" +
   "Version: 1\r\n" +
   "Currency: beta_brousouf\r\n" +
   "Number: 0\r\n" +
   "GeneratedOn: 1380397288\r\n" +
   "MembersRoot: F5ACFD67FC908D28C0CFDAD886249AC260515C90\r\n" +
   "MembersCount: 3\r\n" +
   "MembersChanges:\r\n" +
   "+2E69197FAB029D8669EF85E82457A1587CA0ED9C\r\n" +
   "+33BBFC0C67078D72AF128B5BA296CC530126F372\r\n" +
   "+C73882B64B7E72237A2F460CE9CAB76D19A8651E\r\n" +
    "\r\n";


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

  //-----------------------------
  // Some pre-signed stuff here

  var message     = fs.readFileSync(__dirname + "/../data/transaction/cat.tx", 'utf8');
  var signature   = fs.readFileSync(__dirname + "/../data/transaction/cat.tx.asc", 'utf8');
  var messageCRLF = fs.readFileSync(__dirname + "/../data/transaction/cat.tx.dos", 'utf8');

  it('jpgp.verify() must NOT verify external gpg signature + LF line ending', function(done){
    verify(message.dos2unix(), catRawPubKey, signature, testVerified(false, done));
  });

  it('jpgp.verify() must verify external gpg signature + CRLF line ending', function(done){
    verify(message.unix2dos(), catRawPubKey, signature, testVerified(true, done));
  });

  it('jpgp.verify() must verify external gpg signature + CRLF line ending file', function(done){
    verify(messageCRLF, catRawPubKey, signature, testVerified(true, done));
  });

  it('jpgp.verify() must NOT verify external gpg signature + CRLF line ending file', function(done){
    verify(messageCRLF.dos2unix(), catRawPubKey, signature, testVerified(false, done));
  });

  it('jpgp.verify() must NOT pass external gpg signature + wrong data', function(done){
    verify(message + "some delta", catRawPubKey, signature, testVerified(false, done));
  });
});

describe('Public key message signature:', function(){

  var asciiPubkey = fs.readFileSync(__dirname + "/../data/lolcat.pub", 'utf8');

  before(function (done) {
    gnupg.init(done);
  });

  it('jpgp.sign() should BE verified (fixed bug in openpgpjs lib)', function(done){
    async.waterfall([
      async.apply(jpgp().sign, asciiPubkey, catPrivateKey),
      async.apply(verify, asciiPubkey, catRawPubKey),
    ], testVerified(true, done));
  });

  it('jpgp.sign() must NOT be verified with wrong data', function(done){
    async.waterfall([
      async.apply(jpgp().sign, asciiPubkey, catPrivateKey),
      async.apply(verify, asciiPubkey + "some delta", catRawPubKey),
    ], testVerified(false, done));
  });

  //-----------------------------
  // gnupg.js test

  // TODO: this test do not pass, however it should (gpg does attest it)
  // it('jpgp.verify() should verify gnupg.js --clearsign signature', function(done){
  //   async.waterfall([
  //     async.apply(gnupg.clearsign, asciiPubkey),
  //     async.apply(verify, asciiPubkey, catRawPubKey),
  //   ], testVerified(true, done));
  // });

  it('jpgp.verify() should verify gnupg.js -sba signature', function(done){
    async.waterfall([
      async.apply(gnupg.sign, asciiPubkey),
      async.apply(verify, asciiPubkey, catRawPubKey),
    ], testVerified(true, done));
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

function verify (message, pubkey, signature, done) {
  jpgp()
    .publicKey(pubkey)
    .data(message)
    .signature(signature)
    .verify(done);
}