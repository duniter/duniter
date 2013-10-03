var should   = require('should');
var assert   = require('assert');
var mongoose = require('mongoose');
var sha1     = require('sha1');
var server   = require('../app/lib/server');


server.database.init();
var Amendment = mongoose.model('Amendment');

var amTest;

describe('Amendment', function(){

  describe('2 of beta_brousouf currency', function(){

    // Loads amTest with its data
    before(function(done) {
      amTest = new Amendment();
      amTest.loadFromFile(__dirname + "/data/amendments/BB-AM2-OK", function () {
        done();
      });
    });

    it('should be version 1', function(){
      assert.equal(amTest.version, 1);
    });

    it('should have beta_brousouf currency name', function(){
      assert.equal(amTest.currency, 'beta_brousouf');
    });

    it('should be number 2', function(){
      assert.equal(amTest.number, 2);
    });

    it('should have a niversal Dividend of value 110', function(){
      assert.equal(amTest.dividend, 110);
    });

    it('should have a Minimal Coin Power of 0', function(){
      assert.equal(amTest.coinMinPower, 0);
    });

    it('should have 5A6434BCD09400625CEA75BFE6F786829018BAD1 previous hash', function(){
      assert.equal(amTest.previousHash, '5A6434BCD09400625CEA75BFE6F786829018BAD1');
    });

    it('should have no members status root', function(){
      should.not.exist(amTest.membersStatusRoot);
    });

    it('should have 7B66992FD748579B0774EDFAD7AB84143357F7BC members hash', function(){
      assert.equal(amTest.membersRoot, '7B66992FD748579B0774EDFAD7AB84143357F7BC');
    });

    it('should have DC7A9229DFDABFB9769789B7BFAE08048BCB856F voters hash', function(){
      assert.equal(amTest.votersRoot, 'DC7A9229DFDABFB9769789B7BFAE08048BCB856F');
    });

    it('should have no voters signatures root', function(){
      should.not.exist(amTest.votersSigRoot);
    });

    it('should have the following new member', function(){
      var newMembers = amTest.getNewMembers();
      assert.equal(newMembers.length, 1);
      assert.equal(amTest.membersCount, 4);
      assert.equal(newMembers[0], "B6AE93DDE390B1E11FA97EEF78B494F99025C77E"); // walter white
    });

    it('should have 0 new voters', function(){
      var voters = amTest.getNewVoters();
      assert.equal(voters.length, 0);
      assert.equal(amTest.votersCount, 2);
    });

    it('should have one voter leaving', function(){
      var leavingVoters = amTest.getLeavingVoters();
      assert.equal(leavingVoters.length, 1);
      assert.equal(amTest.votersCount, 2);
    });

    it('its computed hash should be F5372B1A5505DB5FBFDD146E5B391C6252B7D174', function(){
      assert.equal(amTest.hash, 'F5372B1A5505DB5FBFDD146E5B391C6252B7D174');
    });

    it('its manual hash should be F5372B1A5505DB5FBFDD146E5B391C6252B7D174', function(){
      assert.equal(sha1(amTest.getRaw()).toUpperCase(), 'F5372B1A5505DB5FBFDD146E5B391C6252B7D174');
    });
  });
});