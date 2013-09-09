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

  describe('KEYS signed by ubot1', function(){

    var pr;

    // Loads pr with its data
    before(function(done) {
      pr = new Peer();
      loadFromFile(pr, __dirname + "/data/peering/ubot1.peering", done);
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

    it('its computed hash should be 93FCDB40152973EEF1F4872E5B9C283BD8938CD0', function(){
      assert.equal(pr.hash, '93FCDB40152973EEF1F4872E5B9C283BD8938CD0');
    });

    it('its manual hash should be 93FCDB40152973EEF1F4872E5B9C283BD8938CD0', function(){
      assert.equal(sha1(pr.getRaw()).toUpperCase(), '93FCDB40152973EEF1F4872E5B9C283BD8938CD0');
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
