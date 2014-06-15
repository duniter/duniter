var should   = require('should');
var assert   = require('assert');
var async    = require('async');
var sha1     = require('sha1');
var fs       = require('fs');
var mongoose = require('mongoose');
var parsers  = require('../app/lib/streams/parsers/doc');
var ucoin    = require('./..');

var rawPeer = "" +
  "Version: 1\r\n" +
  "Currency: beta_brousouf\r\n" +
  "Fingerprint: D049002A6724D35F867F64CC087BA351C0AEB6DF\r\n" +
  "Endpoints:\r\n" +
  "BASIC_MERKLED_API ucoin.twiced.fr 88.163.127.43 9101\r\n" +
  "OTHER_PROTOCOL 88.163.127.43 9102\r\n";

var Peer = mongoose.model('Peer', require('../app/models/peer'));

describe('Peer', function(){

  describe('of ubot1', function(){

    var pr;

    before(function(done) {
      var parser = parsers.parsePeer().asyncWrite(rawPeer, function (err, obj) {
        pr = new Peer(obj);
        done(err);
      });
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

    it('should have 2 endpoints', function(){
      assert.equal(pr.endpoints.length, 2);
    });

    it('should have DNS', function(){
      assert.equal(pr.getDns(), 'ucoin.twiced.fr');
    });

    it('should have IPv4', function(){
      should.exist(pr.getIPv4());
      assert.equal(pr.getIPv4(), "88.163.127.43");
    });

    it('should have no IPv6 address', function(){
      should.not.exist(pr.getIPv6());
    });

    it('should have port 9101', function(){
      assert.equal(pr.getPort(), 9101);
    });

    // it('its computed hash should be D031ECEB784DA346239DB7AF1F5389361E6F1988', function(){
    //   assert.equal(pr.hash, 'D031ECEB784DA346239DB7AF1F5389361E6F1988');
    // });

    // it('its manual hash should be D031ECEB784DA346239DB7AF1F5389361E6F1988', function(){
    //   assert.equal(sha1(pr.getRaw()).toUpperCase(), 'D031ECEB784DA346239DB7AF1F5389361E6F1988');
    // });

    it('its computed hash should be the good one', function(){
      assert.equal(pr.hash, '057E6F2C568944ED0FBC50EECC72ED8125821D3D');
    });

    it('its manual hash should be 057E6F2C568944ED0FBC50EECC72ED8125821D3D', function(){
      assert.equal(sha1(pr.getRaw()).toUpperCase(), '057E6F2C568944ED0FBC50EECC72ED8125821D3D');
    });

    it('its manual SIGNED hash should be the same (because no signature is provided)', function(){
      assert.equal(sha1(pr.getRaw()).toUpperCase(), '057E6F2C568944ED0FBC50EECC72ED8125821D3D');
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
