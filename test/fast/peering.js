"use strict";
var should   = require('should');
var assert   = require('assert');
var parsers  = require('../../app/lib/streams/parsers');

var rawPeer = "" +
  "Version: 10\n" +
  "Type: Peer\n" +
  "Currency: beta_brousouf\n" +
  "PublicKey: 3Z7w5g4gC9oxwEbATnmK2UFgGWhLZPmZQb5dRxvNrXDu\n" +
  "Block: 0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855\n" +
  "Endpoints:\n" +
  "BASIC_MERKLED_API ucoin.twiced.fr 88.163.127.43 9101\n" +
  "OTHER_PROTOCOL 88.163.127.43 9102\n" +
  "bvuKzc6+cGWMGC8FIkZHN8kdQhaRL/MK60KYyw5vJqkKEgxXbygQHAzfoojeSY4gPKIu4FggBkR1HndSEm2FAQ==\n";

var Peer = require('../../app/lib/entity/peer');

describe('Peer', function(){

  describe('of some key', function(){

    var pr;

    before(function(done) {
      pr = new Peer(parsers.parsePeer.syncWrite(rawPeer));
      done();
    });

    it('should be version 10', function(){
      assert.equal(pr.version, 10);
    });

    it('should have beta_brousoufs currency name', function(){
      assert.equal(pr.currency, 'beta_brousouf');
    });

    it('should have public key', function(){
      assert.equal(pr.pubkey, '3Z7w5g4gC9oxwEbATnmK2UFgGWhLZPmZQb5dRxvNrXDu');
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
