var should   = require('should');
var assert   = require('assert');
var async    = require('async');
var sha1     = require('sha1');
var fs       = require('fs');
var mongoose = require('mongoose');
var server   = require('../app/lib/server');

server.database.init();
var Peer = mongoose.model('Peer');

describe('Peer', function(){

  describe('KEYS signed by Cat', function(){

    var pr;

    // Loads pr with its data
    before(function(done) {
      pr = new Peer();
      loadFromFile(pr, __dirname + "/data/peering/ubot1.keys", done);
    });

    it('should be version 1', function(){
      assert.equal(pr.version, 1);
    });

    it('should have beta_brousoufs currency name', function(){
      assert.equal(pr.currency, 'beta_brousouf');
    });

    it('should have DNS', function(){
      assert.equal(pr.dns, 'ucoin.twiced.fr');
    });

    it('should have IPv4', function(){
      should.exist(pr.ipv4);
      assert.equal(pr.ipv4, "88.163.127.43");
    });

    it('should have no IPv6 address', function(){
      should.not.exist(pr.ipv6);
    });

    it('should have port 9101', function(){
      assert.equal(pr.port, 9101);
    });

    it('should have 5 keys', function(){
      assert.equal(pr.keys.length, 5);
    });

    it('its computed hash should be C98B872AA1B93DCAF96B4DAC29DD98E937EB8515', function(){
      assert.equal(pr.hash, 'C98B872AA1B93DCAF96B4DAC29DD98E937EB8515');
    });

    it('its manual hash should be C98B872AA1B93DCAF96B4DAC29DD98E937EB8515', function(){
      assert.equal(sha1(pr.getRaw()).toUpperCase(), 'C98B872AA1B93DCAF96B4DAC29DD98E937EB8515');
    });
  });

  describe('ALL signed by Snow', function(){

    var pr;

    // Loads pr with its data
    before(function(done) {
      pr = new Peer();
      loadFromFile(pr, __dirname + "/data/peering/snow.all", done);
    });

    it('should be version 1', function(){
      assert.equal(pr.version, 1);
    });

    it('should have beta_brousoufs currency name', function(){
      assert.equal(pr.currency, 'beta_brousouf');
    });

    it('should have DNS', function(){
      assert.equal(pr.dns, 'ucoin.twiced.fr');
    });

    it('should have IPv4', function(){
      should.exist(pr.ipv4);
      assert.equal(pr.ipv4, "88.163.127.43");
    });

    it('should have no IPv6 address', function(){
      should.not.exist(pr.ipv6);
    });

    it('should have port 9101', function(){
      assert.equal(pr.port, 9101);
    });

    it('should have 0 keys', function(){
      assert.equal(pr.keys.length, 0);
    });

    it('its computed hash should be B4E23C2F771E78E67C8C2F45FAC1B6C4A3E9E6F2', function(){
      assert.equal(pr.hash, 'B4E23C2F771E78E67C8C2F45FAC1B6C4A3E9E6F2');
    });

    it('its manual hash should be B4E23C2F771E78E67C8C2F45FAC1B6C4A3E9E6F2', function(){
      assert.equal(sha1(pr.getRaw()).toUpperCase(), 'B4E23C2F771E78E67C8C2F45FAC1B6C4A3E9E6F2');
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
