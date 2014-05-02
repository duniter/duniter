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

var catRawKey = fs.readFileSync(__dirname + "/data/lolcat.priv", 'utf8');
var catRawPubKey = fs.readFileSync(__dirname + "/data/lolcat.pub", 'utf8');
var catPasswd = "lolcat";
var cat = signatory(catRawKey, catPasswd);
// var catPrivateKey = openpgp.read_privateKey(catRawKey, catPasswd)[0];

var catPrivateKey = openpgp.key.readArmored(catRawKey).keys[0];
catPrivateKey.decrypt(catPasswd);

describe("Cat's pubkey contain 2 subkeys", function(){

  it('should handle basic openpgp.js test', function(){
    var cert = jpgp().certificate(catRawPubKey);
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
