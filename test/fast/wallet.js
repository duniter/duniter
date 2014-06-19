var should   = require('should');
var assert   = require('assert');
var async    = require('async');
var sha1     = require('sha1');
var fs       = require('fs');
var mongoose = require('mongoose');
var parsers  = require('../../app/lib/streams/parsers/doc');
var ucoin    = require('../..');

var Wallet = mongoose.model('Wallet', require('../../app/models/wallet'));
var rawWallet = fs.readFileSync(__dirname + "/../data/wallets/cat.entry", "utf8")
           + fs.readFileSync(__dirname + "/../data/wallets/cat.entry.asc", "utf8");

describe('Wallet', function(){

  describe('KEYS signed by cat', function(){

    var entry;

    before(function(done) {
      var parser = parsers.parseWallet().asyncWrite(rawWallet, function (err, obj) {
        entry = new Wallet(obj);
        done(err);
      });
    });

    it('should be version 1', function(){
      assert.equal(entry.version, 1);
    });

    it('should have beta_brousoufs currency name', function(){
      assert.equal(entry.currency, 'beta_brousouf');
    });

    it('should have key', function(){
      assert.equal(entry.fingerprint, 'C73882B64B7E72237A2F460CE9CAB76D19A8651E');
    });

    it('should have date', function(){
      should.exist(entry.date);
    });

    it('should have number of required trusts', function(){
      should.exist(entry.requiredTrusts);
    });

    it('should have 2 hosters, 2 trusts', function(){
      assert.equal(entry.hosters.length, 2);
      assert.equal(entry.trusts.length, 2);
      assert.equal(entry.hosters[0], "C73882B64B7E72237A2F460CE9CAB76D19A8651E");
      assert.equal(entry.hosters[1], "D049002A6724D35F867F64CC087BA351C0AEB6DF");
      assert.equal(entry.trusts[0], "C73882B64B7E72237A2F460CE9CAB76D19A8651E");
      assert.equal(entry.trusts[1], "D049002A6724D35F867F64CC087BA351C0AEB6DF");
    });

    it('its computed hash should be F337A41D2D7AA85BCB82E0DD69E764CFD7539E79', function(){
      assert.equal(entry.hash, 'F337A41D2D7AA85BCB82E0DD69E764CFD7539E79');
    });

    it('its manual hash should be 26F7B78AABB198D66F0CFB3F526E9C02B6B6F521', function(){
      assert.equal(sha1(entry.getRaw()).toUpperCase(), '26F7B78AABB198D66F0CFB3F526E9C02B6B6F521');
    });

    it('its manual signed hash should be F337A41D2D7AA85BCB82E0DD69E764CFD7539E79', function(){
      assert.equal(sha1(entry.getRawSigned()).toUpperCase(), 'F337A41D2D7AA85BCB82E0DD69E764CFD7539E79');
    });
  });
});
