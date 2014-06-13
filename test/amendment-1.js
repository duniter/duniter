var should   = require('should');
var assert   = require('assert');
var mongoose = require('mongoose');
var sha1     = require('sha1');
var parsers  = require('../app/lib/streams/parsers/doc');

var AM1 = "" +
  "Version: 1\r\n" +
  "Currency: beta_brousouf\r\n" +
  "Number: 1\r\n" +
  "GeneratedOn: 1380398542\r\n" +
  "NextRequiredVotes: 2\r\n" +
  "PreviousHash: 58A2700B6CE56E112238FDCD81C8DACE2F2D06DC\r\n" +
  "MembersRoot: F5ACFD67FC908D28C0CFDAD886249AC260515C90\r\n" +
  "MembersCount: 3\r\n" +
  "MembersChanges:\r\n" +
  "VotersRoot: F5ACFD67FC908D28C0CFDAD886249AC260515C90\r\n" +
  "VotersCount: 3\r\n" +
  "VotersChanges:\r\n";

var Amendment = mongoose.model('Amendment', require('../app/models/amendment'));
var amTest;

describe('Amendment', function(){

  describe('1 of beta_brousouf currency', function(){

    // Loads amTest with its data
    before(function(done) {
      var parser = parsers.parseAmendment();
      parser.end(AM1);
      parser.on('readable', function () {
        var parsed = parser.read();
        amTest = new Amendment(parsed);
        done();
      });
    });

    it('should be version 1', function(){
      assert.equal(amTest.version, 1);
    });

    it('should have beta_brousouf currency name', function(){
      assert.equal(amTest.currency, 'beta_brousouf');
    });

    it('should be number 1', function(){
      assert.equal(amTest.number, 1);
    });

    it('should have no Universal Dividend', function(){
      should.not.exist(amTest.dividend);
    });

    it('should have no Minimal Coin Power', function(){
      should.not.exist(amTest.coinMinPower);
    });

    it('should have 58A2700B6CE56E112238FDCD81C8DACE2F2D06DC previous hash', function(){
      assert.equal(amTest.previousHash, '58A2700B6CE56E112238FDCD81C8DACE2F2D06DC');
    });

    it('should have 0 new members', function(){
      var newMembers = amTest.getNewMembers();
      assert.equal(newMembers.length, 0);
      assert.equal(amTest.membersCount, 3);
    });

    it('should have no members status root', function(){
      should.not.exist(amTest.membersStatusRoot);
    });

    it('should have F5ACFD67FC908D28C0CFDAD886249AC260515C90 voters hash', function(){
      assert.equal('F5ACFD67FC908D28C0CFDAD886249AC260515C90', amTest.votersRoot);
    });

    it('should have the following 0 new voters', function(){
      var newVoters = amTest.getNewVoters();
      assert.equal(newVoters.length, 0);
      assert.equal(amTest.votersCount, 3);
    });

    it('should have no voters signatures root', function(){
      should.not.exist(amTest.votersSigRoot);
    });

    it('its computed hash should be F07D0B6DBB7EA99E5208752EABDB8B721C0010E9', function(){
      assert.equal(amTest.hash, 'F07D0B6DBB7EA99E5208752EABDB8B721C0010E9');
    });

    it('its manual hash should be F07D0B6DBB7EA99E5208752EABDB8B721C0010E9', function(){
      assert.equal(sha1(amTest.getRaw()).toUpperCase(), 'F07D0B6DBB7EA99E5208752EABDB8B721C0010E9');
    });
  });
});