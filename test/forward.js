var should   = require('should');
var assert   = require('assert');
var async    = require('async');
var sha1     = require('sha1');
var fs       = require('fs');
var mongoose = require('mongoose');
var ucoin    = require('./..');

var Forward = mongoose.model('Forward', require('../app/models/forward'));

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

    it('should have from', function(){
      assert.equal(pr.from, 'D049002A6724D35F867F64CC087BA351C0AEB6DF');
    });

    it('should have to', function(){
      assert.equal(pr.to, 'C73882B64B7E72237A2F460CE9CAB76D19A8651E');
    });

    it('should have 5 keys', function(){
      assert.equal(pr.keys.length, 5);
    });

    it('its computed hash should be 9512594D09A65EB7684DB5541F07B17AACFB5460', function(){
      assert.equal(pr.hash, '9512594D09A65EB7684DB5541F07B17AACFB5460');
    });

    it('its manual hash should be 9512594D09A65EB7684DB5541F07B17AACFB5460', function(){
      assert.equal(sha1(pr.getRaw()).toUpperCase(), '9512594D09A65EB7684DB5541F07B17AACFB5460');
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

    it('should have from', function(){
      assert.equal(pr.from, '33BBFC0C67078D72AF128B5BA296CC530126F372');
    });

    it('should have to', function(){
      assert.equal(pr.to, 'D049002A6724D35F867F64CC087BA351C0AEB6DF');
    });

    it('should have 0 keys', function(){
      assert.equal(pr.keys.length, 0);
    });

    it('its computed hash should be 13F1B64A24A0156F61CF991AD6F57508871502F5', function(){
      assert.equal(pr.hash, '13F1B64A24A0156F61CF991AD6F57508871502F5');
    });

    it('its manual hash should be 13F1B64A24A0156F61CF991AD6F57508871502F5', function(){
      assert.equal(sha1(pr.getRaw()).toUpperCase(), '13F1B64A24A0156F61CF991AD6F57508871502F5');
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
