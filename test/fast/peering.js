var should   = require('should');
var assert   = require('assert');
var async    = require('async');
var sha1     = require('sha1');
var fs       = require('fs');
var parsers  = require('../../app/lib/streams/parsers/doc');
var ucoin    = require('../../index');

var rawPeer = "" +
  "Version: 1\n" +
  "Type: Peer\n" +
  "Currency: beta_brousouf\n" +
  "PublicKey: 3Z7w5g4gC9oxwEbATnmK2UFgGWhLZPmZQb5dRxvNrXDu\n" +
  "Block: 0-DA39A3EE5E6B4B0D3255BFEF95601890AFD80709\n" +
  "Endpoints:\n" +
  "BASIC_MERKLED_API ucoin.twiced.fr 88.163.127.43 9101\n" +
  "OTHER_PROTOCOL 88.163.127.43 9102\n" +
  "bvuKzc6+cGWMGC8FIkZHN8kdQhaRL/MK60KYyw5vJqkKEgxXbygQHAzfoojeSY4gPKIu4FggBkR1HndSEm2FAQ==\n";

var Peer = require('../../app/lib/entity/peer');

describe('Peer', function(){

  describe('of some key', function(){

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

    it('should have public key', function(){
      assert.equal(pr.pub, '3Z7w5g4gC9oxwEbATnmK2UFgGWhLZPmZQb5dRxvNrXDu');
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
  });
});
