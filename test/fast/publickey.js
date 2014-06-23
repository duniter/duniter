var should    = require('should');
var assert    = require('assert');
var mongoose  = require('mongoose');
var sha1      = require('sha1');
var signatory = require('./../tool/signatory');
var openpgp   = require('openpgp');
var fs        = require('fs');
var jpgp      = require('../../app/lib/jpgp');
var async     = require('async');
var common    = require('../../app/lib/common');
var parsers   = require('../../app/lib/streams/parsers/doc');

var PublicKey = mongoose.model('PublicKey', require('../../app/models/publickey'));

var catRawPrivateKey = fs.readFileSync(__dirname + "/../data/lolcat.priv", 'utf8');
var catRawPublicKey = fs.readFileSync(__dirname + "/../data/lolcat.pub", 'utf8');
var catPasswd = "lolcat";
var cat = signatory(catRawPrivateKey, catPasswd);
// var catPrivateKey = openpgp.read_privateKey(catRawPrivateKey, catPasswd)[0];

var cgeekRawPublicKey = fs.readFileSync(__dirname + "/../data/cgeek.pub", 'utf8');

var catPrivateKey = openpgp.key.readArmored(catRawPrivateKey).keys[0];
catPrivateKey.decrypt(catPasswd);

describe("Cat's pubkey contain 2 subkeys", function(){

  it('should handle basic openpgp.js test', function(){
    var cert = jpgp().certificate(catRawPublicKey);
    cert.fingerprint.should.equal("C73882B64B7E72237A2F460CE9CAB76D19A8651E");
    assert.deepEqual(cert.uids, [
      "LoL Cat (udid2;c;CAT;LOL;2000-04-19;e+43.70-079.42;0;) <cem.moreau@gmail.com>"
    ]);
    assert.deepEqual(cert.subkeys, [
      "847EC6D91E730671D484BFE25F232B545F7382AE",
      "6B92932234B5E29E79826E563D19B40BCE40EDF5"
    ]);
  });
});

describe("Cat's pubkey should be parseable", function(){

  var pubkey;

  before(function (done) {
    var parser = parsers.parsePubkey();
    parser.end(catRawPublicKey);
    parser.on('readable', function () {
      var parsed = parser.read();
      pubkey = new PublicKey(parsed);
      done();
    });
  });

  it('and have good fingerprint', function(){
    pubkey.fingerprint.should.equal("C73882B64B7E72237A2F460CE9CAB76D19A8651E");
  });

  it('and have good hash', function(){
    pubkey.hash.should.equal(sha1(catRawPublicKey).toUpperCase());
  });

  it('and have good raw field', function(){
    pubkey.raw.should.equal(catRawPublicKey);
  });

  it('and have 2 subkeys', function(){
    assert.deepEqual(pubkey.subkeys.slice(), [
      "847EC6D91E730671D484BFE25F232B545F7382AE",
      "6B92932234B5E29E79826E563D19B40BCE40EDF5"
    ].slice());
  });

  it('and have a valid udid2 field', function(){
    assert.equal(pubkey.udid2.uid, 'LoL Cat (udid2;c;CAT;LOL;2000-04-19;e+43.70-079.42;0;) <cem.moreau@gmail.com>');
  });

  it('and have 0 udid2 signatures', function(){
    assert.equal(pubkey.udid2sigs.length, 0);
  });
});


describe("Cgeek's pubkey should be parseable", function(){

  var pubkey;

  before(function (done) {
    var parser = parsers.parsePubkey();
    parser.end(cgeekRawPublicKey);
    parser.on('readable', function () {
      var parsed = parser.read();
      pubkey = new PublicKey(parsed);
      done();
    });
  });

  it('and have good fingerprint', function(){
    pubkey.fingerprint.should.equal("31A6302161AC8F5938969E85399EB3415C237F93");
  });

  it('and have good hash', function(){
    pubkey.hash.should.equal(sha1(cgeekRawPublicKey).toUpperCase());
  });

  it('and have good raw field', function(){
    pubkey.raw.should.equal(cgeekRawPublicKey);
  });

  it('and have 1 subkeys', function(){
    assert.equal(pubkey.subkeys.length, 1);
  });

  it('and have a valid udid2 field', function(){
    assert.equal(pubkey.udid2.uid, 'cgeek twicedd (udid2;c;MOREAU;CEDRIC;1988-04-29;e+47.47-000.56;0;) <cem.moreau@gmail.com>');
  });

  it('and have 0 udid2 signatures', function(){
    assert.equal(pubkey.udid2sigs.length, 0);
  });
});
