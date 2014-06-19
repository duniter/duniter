var should   = require('should');
var assert   = require('assert');
var mongoose = require('mongoose');
var sha1     = require('sha1');
var parsers  = require('../../app/lib/streams/parsers/doc');
var fs       = require('fs');

var AM2 = "" +
  "Version: 1\r\n" +
  "Currency: beta_brousouf\r\n" +
  "Number: 2\r\n" +
  "GeneratedOn: 1380400542\r\n" +
  "UniversalDividend: 1184\r\n" +
  "CoinAlgo: Base2Draft\r\n" +
  "CoinBase: 4\r\n" +
  "CoinList: 14 6 2 3 1\r\n" +
  "NextRequiredVotes: 2\r\n" +
  "PreviousHash: F07D0B6DBB7EA99E5208752EABDB8B721C0010E9\r\n" +
  "MembersRoot: 7B66992FD748579B0774EDFAD7AB84143357F7BC\r\n" +
  "MembersCount: 4\r\n" +
  "MembersChanges:\r\n" +
  "+B6AE93DDE390B1E11FA97EEF78B494F99025C77E\r\n" +
  "VotersRoot: DC7A9229DFDABFB9769789B7BFAE08048BCB856F\r\n" +
  "VotersCount: 2\r\n" +
  "VotersChanges:\r\n" +
  "-C73882B64B7E72237A2F460CE9CAB76D19A8651E\r\n";

var Amendment = mongoose.model('Amendment', require('../../app/models/amendment'));
var amTest;

describe('Amendment', function(){

  describe('2 of beta_brousouf currency', function(){

    // Loads amTest with its data
    before(function(done) {
      var parser = parsers.parseAmendment();
      parser.end(AM2);
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

    it('should be number 2', function(){
      assert.equal(amTest.number, 2);
    });

    it('should have a niversal Dividend of value 1184', function(){
      assert.equal(amTest.dividend, 1184);
    });

    it('should have a Minimal Coin Base of 4', function(){
      assert.equal(amTest.coinBase, 4);
    });

    it('should have F07D0B6DBB7EA99E5208752EABDB8B721C0010E9 previous hash', function(){
      assert.equal(amTest.previousHash, 'F07D0B6DBB7EA99E5208752EABDB8B721C0010E9');
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

    it('its computed hash should be 5234E02254151A232197BD629FA0A52DE35FE780', function(){
      assert.equal(amTest.hash, '5234E02254151A232197BD629FA0A52DE35FE780');
    });

    it('its manual hash should be 5234E02254151A232197BD629FA0A52DE35FE780', function(){
      assert.equal(sha1(amTest.getRaw()).toUpperCase(), '5234E02254151A232197BD629FA0A52DE35FE780');
    });
  });
});