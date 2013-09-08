var should   = require('should');
var assert   = require('assert');
var async    = require('async');
var sha1     = require('sha1');
var fs       = require('fs');
var mongoose = require('mongoose');
var server   = require('../app/lib/server');

server.database.init();
var Forward = mongoose.model('Forward');

describe('Forward', function(){

  describe('KEYS signed by ubot1', function(){

    var pr;

    // Loads pr with its data
    before(function(done) {
      pr = new Forward();
      loadFromFile(pr, __dirname + "/data/peering/ubot1.keys", done);
    });

    it('should be version 1', function(){
      assert.equal(pr.version, 1);
    });

    it('should have beta_brousoufs currency name', function(){
      assert.equal(pr.currency, 'beta_brousouf');
    });

    it('should have fingerprint', function(){
      assert.equal(pr.fingerprint, 'D049002A6724D35F867F64CC087BA351C0AEB6DF');
    });

    it('should have 5 keys', function(){
      assert.equal(pr.keys.length, 5);
    });

    it('its computed hash should be DC95EF67F30764D24977026801F1F71063795A2D', function(){
      assert.equal(pr.hash, 'DC95EF67F30764D24977026801F1F71063795A2D');
    });

    it('its manual hash should be DC95EF67F30764D24977026801F1F71063795A2D', function(){
      assert.equal(sha1(pr.getRaw()).toUpperCase(), 'DC95EF67F30764D24977026801F1F71063795A2D');
    });
  });

  describe('ALL signed by Snow', function(){

    var pr;

    // Loads pr with its data
    before(function(done) {
      pr = new Forward();
      loadFromFile(pr, __dirname + "/data/peering/snow.all", done);
    });

    it('should be version 1', function(){
      assert.equal(pr.version, 1);
    });

    it('should have beta_brousoufs currency name', function(){
      assert.equal(pr.currency, 'beta_brousouf');
    });

    it('should have fingerprint', function(){
      assert.equal(pr.fingerprint, '33BBFC0C67078D72AF128B5BA296CC530126F372');
    });

    it('should have 0 keys', function(){
      assert.equal(pr.keys.length, 0);
    });

    it('its computed hash should be CC0BDED6DED99808CF885915BA38C3F520B8F7FB', function(){
      assert.equal(pr.hash, 'CC0BDED6DED99808CF885915BA38C3F520B8F7FB');
    });

    it('its manual hash should be CC0BDED6DED99808CF885915BA38C3F520B8F7FB', function(){
      assert.equal(sha1(pr.getRaw()).toUpperCase(), 'CC0BDED6DED99808CF885915BA38C3F520B8F7FB');
    });
  });
});

function loadFromFile(pr, file, done) {
  fs.readFile(file, {encoding: "utf8"}, function (err, data) {
    async.waterfall([
      function (next){
        pr.parse(data, next);
      },
      function (pr, next){
        pr.verify('beta_brousouf', next);
      }
    ], done);
  });
}
