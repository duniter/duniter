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

describe('Signature:', function(){

  before(function (done) {
    gnupg.init(done);
  });

  // it('jpgp.sign() should start with detached signature', function(done){

  //   var message = "This is lolcat";

  //   jpgp().sign(message, catPrivateKey, function (err, signature) {
  //     console.log(signature);
  //     assert.equal(signature.indexOf('-----BEGIN PGP SIGNATURE-----'), 0);
  //     done();
  //   });
  // });

  it('jpgp.sign() should be verified', function(done){

    var message = "This is lolcat";

    async.waterfall([
      function (next){
        jpgp().sign(message, catPrivateKey, next);
      },
      function (signature, next){
        verify(message, signature, catRawPubKey, next);
      },
    ], function (err, verified) {
      should.not.exist(err);
      assert.equal(true, verified);
      done();
    });
  });

  it('jpgp.sign() must NOT be verified with wrong data', function(done){

    var message = "This is lolcat";

    async.waterfall([
      function (next){
        jpgp().sign(message, catPrivateKey, next);
      },
      function (signature, next){
        verify(message + "some delta", signature, catRawPubKey, next);
      },
    ], function (err, verified) {
      should.exist(err);
      assert.equal(false, verified);
      done();
    });
  });

  //-----------------------------
  // Some pre-signed stuff here

  var message     = fs.readFileSync(__dirname + "/data/aa", 'utf8');
  var signature   = fs.readFileSync(__dirname + "/data/aa.asc", 'utf8');
  var messageCRLF = fs.readFileSync(__dirname + "/data/aa.dos", 'utf8');

  it('jpgp.verify() must NOT verify external gpg signature + CRLF line ending', function(done){
    verify(message.dos2unix(), signature, catRawPubKey, testVerified(false, done));
  });

  it('jpgp.verify() must verify external gpg signature + LF line ending', function(done){
    verify(message.unix2dos(), signature, catRawPubKey, testVerified(true, done));
  });

  it('jpgp.verify() must verify external gpg signature + CRLF line ending file', function(done){
    verify(messageCRLF, signature, catRawPubKey, testVerified(true, done));
  });

  it('jpgp.verify() must NOT verify external gpg signature + CRLF line ending file', function(done){
    verify(messageCRLF.dos2unix(), signature, catRawPubKey, testVerified(false, done));
  });

  it('jpgp.verify() must NOT pass external gpg signature + wrong data', function(done){
    verify(message + "some delta", signature, catRawPubKey, testVerified(false, done));
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

function verify (message, signature, pubkey, done) {
  jpgp()
    .publicKey(pubkey)
    .data(message)
    .noCarriage()
    .signature(signature)
    .verify(done);
}