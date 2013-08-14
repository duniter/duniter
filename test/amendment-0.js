var should   = require('should');
var assert   = require('assert');
var mongoose = require('mongoose');
var sha1     = require('sha1');
var server   = require('../app/lib/server');


server.database.init();
var Amendment = mongoose.model('Amendment');

var amTest;

describe('Amendment', function(){

  describe('0 of beta_brousouf currency', function(){

    // Loads amTest with its data
    before(function(done) {
      amTest = new Amendment();
      amTest.loadFromFile(__dirname + "/data/amendments/BB-AM0-OK", done);
    });

    it('should be version 1', function(){
      assert.equal(amTest.version, 1);
    });

    it('should have beta_brousouf currency name', function(){
      assert.equal(amTest.currency, 'beta_brousouf');
    });

    it('should be number 0', function(){
      assert.equal(amTest.number, 0);
    });

    it('should have no Universal Dividend', function(){
      should.not.exist(amTest.dividend);
    });

    it('should have no Minimal Coin Power', function(){
      should.not.exist(amTest.coinMinPower);
    });

    it('should have no previous hash', function(){
      should.not.exist(amTest.previousHash);
    });

    it('should have members status root 2A42C5CCC315AF3B9D009CC8E635F8492111F91D', function(){
      assert.equal(amTest.membersStatusRoot, '2A42C5CCC315AF3B9D009CC8E635F8492111F91D');
    });

    it('should have F5ACFD67FC908D28C0CFDAD886249AC260515C90 members hash', function(){
      assert.equal('F5ACFD67FC908D28C0CFDAD886249AC260515C90', amTest.membersRoot);
    });

    it('should have the following 3 new members', function(){
      var newMembers = amTest.getNewMembers();
      assert.equal(newMembers.length, 3);
      assert.equal(amTest.membersCount, 3);
      assert.equal(newMembers[0], "2E69197FAB029D8669EF85E82457A1587CA0ED9C"); // Obito Uchiwa
      assert.equal(newMembers[1], "33BBFC0C67078D72AF128B5BA296CC530126F372"); // John Snow
      assert.equal(newMembers[2], "C73882B64B7E72237A2F460CE9CAB76D19A8651E"); // LoL Cat
    });

    it('should have no voters hash', function(){
      assert.not.exist(amTest.votersRoot);
    });

    it('should have no voters signatures root', function(){
      assert.not.exist(amTest.votersSigRoot);
    });

    it('should have the following 0 new voters', function(){
      var newVoters = amTest.getNewVoters();
      assert.equal(newVoters.length, 0);
      assert.equal(amTest.votersCount, 0);
    });

    it('its computed hash should be 376C5A6126A4688B18D95043261B2D59867D4047', function(){
      assert.equal(amTest.hash, '376C5A6126A4688B18D95043261B2D59867D4047');
    });

    it('its manual hash should be 376C5A6126A4688B18D95043261B2D59867D4047', function(){
      assert.equal(sha1(amTest.getRaw()).toUpperCase(), '376C5A6126A4688B18D95043261B2D59867D4047');
    });
  });
});