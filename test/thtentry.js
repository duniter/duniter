var should   = require('should');
var assert   = require('assert');
var async    = require('async');
var sha1     = require('sha1');
var fs       = require('fs');
var mongoose = require('mongoose');
var server   = require('../app/lib/server');

server.database.init();
var THTEntry = mongoose.model('THTEntry');

describe('THTEntry', function(){

  describe('KEYS signed by cat', function(){

    var entry;

    // Loads entry with its data
    before(function(done) {
      entry = new THTEntry();
      loadFromFile(entry, __dirname + "/data/tht/cat.entry", done);
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

    it('should have 2 hosters, 2 trusts', function(){
      assert.equal(entry.hosters.length, 2);
      assert.equal(entry.trusts.length, 2);
      assert.equal(entry.hosters[0], "C73882B64B7E72237A2F460CE9CAB76D19A8651E");
      assert.equal(entry.hosters[1], "D049002A6724D35F867F64CC087BA351C0AEB6DF");
      assert.equal(entry.trusts[0], "C73882B64B7E72237A2F460CE9CAB76D19A8651E");
      assert.equal(entry.trusts[1], "D049002A6724D35F867F64CC087BA351C0AEB6DF");
    });

    it('its computed hash should be ACFCBC2327524C8363418D49E50169BB558641B3', function(){
      assert.equal(entry.hash, 'ACFCBC2327524C8363418D49E50169BB558641B3');
    });

    it('its manual hash should be B9D8E564EFB29B7F632D32037E619AD293473E4C', function(){
      assert.equal(sha1(entry.getRaw()).toUpperCase(), 'B9D8E564EFB29B7F632D32037E619AD293473E4C');
    });

    it('its manual signed hash should be ACFCBC2327524C8363418D49E50169BB558641B3', function(){
      assert.equal(sha1(entry.getRawSigned()).toUpperCase(), 'ACFCBC2327524C8363418D49E50169BB558641B3');
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
