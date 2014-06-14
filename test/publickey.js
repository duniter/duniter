var should    = require('should');
var assert    = require('assert');
var mongoose  = require('mongoose');
var sha1      = require('sha1');
var signatory = require('./tool/signatory');
var openpgp   = require('openpgp');
var fs        = require('fs');
var jpgp      = require('../app/lib/jpgp');
var async     = require('async');
var common    = require('../app/lib/common');
var parsers   = require('../app/lib/streams/parsers/doc');

var PublicKey = mongoose.model('PublicKey', require('../app/models/publickey'));

var catRawPrivateKey = fs.readFileSync(__dirname + "/data/lolcat.priv", 'utf8');
var catRawPublicKey = fs.readFileSync(__dirname + "/data/lolcat.pub", 'utf8');
var catPasswd = "lolcat";
var cat = signatory(catRawPrivateKey, catPasswd);
// var catPrivateKey = openpgp.read_privateKey(catRawPrivateKey, catPasswd)[0];

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
});
