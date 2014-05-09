var should   = require('should');
var assert   = require('assert');
var async    = require('async');
var sha1     = require('sha1');
var fs       = require('fs');
var mongoose = require('mongoose');
var server   = require('../app/lib/server');

server.database.init();
var Wallet = mongoose.model('Wallet');

describe('Wallet', function(){

  describe('KEYS signed by cat', function(){

    var entry;

    // Loads entry with its data
    before(function(done) {
      entry = new Wallet();
      loadFromFile(entry, __dirname + "/data/wallets/cat.entry", done);
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

    it('its computed hash should be 28D5C1BFC7EDC6F7C8D3A3306778413ABF2C5D19', function(){
      assert.equal(entry.hash, '28D5C1BFC7EDC6F7C8D3A3306778413ABF2C5D19');
    });

    it('its manual hash should be 26F7B78AABB198D66F0CFB3F526E9C02B6B6F521', function(){
      assert.equal(sha1(entry.getRaw()).toUpperCase(), '26F7B78AABB198D66F0CFB3F526E9C02B6B6F521');
    });

    it('its manual signed hash should be 28D5C1BFC7EDC6F7C8D3A3306778413ABF2C5D19', function(){
      assert.equal(sha1(entry.getRawSigned()).toUpperCase(), '28D5C1BFC7EDC6F7C8D3A3306778413ABF2C5D19');
    });
  });
});

function loadFromFile(entry, file, done) {
  fs.readFile(file, {encoding: "utf8"}, function (err, data) {
    if(fs.existsSync(file + ".asc")){
      data += fs.readFileSync(file + '.asc', 'utf8');
    }
    // data = data.unix2dos();
    async.waterfall([
      function (next){
        entry.parse(data, next);
      },
      function (entry, next){
        entry.verify('beta_brousouf', next);
      }
    ], done);
  });
}
