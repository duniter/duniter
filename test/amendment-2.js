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
      amTest.loadFromFile(__dirname + "/data/amendments/BB-AM2-OK", done);
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

    it('should have a niversal Dividend of value 100', function(){
      assert.equal(amTest.dividend, 100);
    });

    it('should have a Minimal Coin Power of 0', function(){
      assert.equal(amTest.coinMinPower, 0);
    });

    it('should have 5756AC297C0A536D1AB5BD6DBC1F2ADB5A88769E previous hash', function(){
      assert.equal(amTest.previousHash, '5756AC297C0A536D1AB5BD6DBC1F2ADB5A88769E');
    });

    it('should have members status root F01226A87106117FEFBACEC1DD78C8EBF2F69690', function(){
      assert.equal(amTest.membersStatusRoot, 'F01226A87106117FEFBACEC1DD78C8EBF2F69690');
    });

    it('should have F92B6F81C85200250EE51783F5F9F6ACA57A9AFF members hash', function(){
      assert.equal(amTest.membersRoot, 'F92B6F81C85200250EE51783F5F9F6ACA57A9AFF');
    });

    it('should have DC7A9229DFDABFB9769789B7BFAE08048BCB856F voters hash', function(){
      assert.equal(amTest.votersRoot, 'DC7A9229DFDABFB9769789B7BFAE08048BCB856F');
    });

    it('should have voters signatures root C8713BB218554D6B61D8897EE1AF675909E7506D', function(){
      assert.equal(amTest.votersSigRoot, 'C8713BB218554D6B61D8897EE1AF675909E7506D');
    });

    it('should have the following new member', function(){
      var newMembers = amTest.getNewMembers();
      assert.equal(newMembers.length, 1);
      assert.equal(amTest.membersCount, 4);
      assert.equal(newMembers[0], "31A6302161AC8F5938969E85399EB3415C237F93"); // cgeek
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

    it('its computed hash should be 2EA65A4CC1B7E4BC9CAB27C71E164E312D9DDD0F', function(){
      assert.equal(amTest.hash, '2EA65A4CC1B7E4BC9CAB27C71E164E312D9DDD0F');
    });

    it('its manual hash should be 2EA65A4CC1B7E4BC9CAB27C71E164E312D9DDD0F', function(){
      assert.equal(sha1(amTest.getRaw()).toUpperCase(), '2EA65A4CC1B7E4BC9CAB27C71E164E312D9DDD0F');
    });
  });
});