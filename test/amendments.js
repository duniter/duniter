var should   = require('should');
var assert   = require('assert');
var fs       = require('fs');
var mongoose = require('mongoose');
var sha1     = require('sha1');
var nodecoin = require('../app/lib/nodecoin');


nodecoin.database.init();
var Amendment = mongoose.model('Amendment');

var amTest;

describe('Amendment', function(){

  describe('0 of beta_brousouf currency', function(){

    // Loads amTest with its data
    before(function(done) {
      amTest = new Amendment();
      fs.readFile(__dirname + "/data/amendments/BB-AM0-OK", {encoding: "utf8"}, function (err, data) {
        amTest.parse(data, function(err) {
          done(err);
        });
      });
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

    it('should have F5ACFD67FC908D28C0CFDAD886249AC260515C90 members hash', function(){
      assert.equal('F5ACFD67FC908D28C0CFDAD886249AC260515C90', amTest.membersRoot);
    });

    it('should have F5ACFD67FC908D28C0CFDAD886249AC260515C90 voters hash', function(){
      assert.equal('F5ACFD67FC908D28C0CFDAD886249AC260515C90', amTest.votersRoot);
    });

    it('should have the following 3 new members', function(){
      var newMembers = amTest.getNewMembers();
      assert.equal(newMembers.length, 3);
      assert.equal(amTest.membersCount, 3);
      assert.equal(newMembers[0], "2E69197FAB029D8669EF85E82457A1587CA0ED9C"); // Obito Uchiwa
      assert.equal(newMembers[1], "33BBFC0C67078D72AF128B5BA296CC530126F372"); // John Snow
      assert.equal(newMembers[2], "C73882B64B7E72237A2F460CE9CAB76D19A8651E"); // LoL Cat
    });

    it('should have the following 3 new voters', function(){
      var newVoters = amTest.getNewVoters();
      assert.equal(newVoters.length, 3);
      assert.equal(amTest.votersCount, 3);
      assert.equal(newVoters[0], "2E69197FAB029D8669EF85E82457A1587CA0ED9C");
      assert.equal(newVoters[1], "33BBFC0C67078D72AF128B5BA296CC530126F372");
      assert.equal(newVoters[2], "C73882B64B7E72237A2F460CE9CAB76D19A8651E");
    });

    it('its hash should be 6F4ACBC7A25A0AAB9B58778EAD5A297EF3E51D00', function(){
      assert.equal(amTest.hash, '6F4ACBC7A25A0AAB9B58778EAD5A297EF3E51D00');
      assert.equal(sha1(amTest.getRaw()).toUpperCase(), '6F4ACBC7A25A0AAB9B58778EAD5A297EF3E51D00');
    });
  });

  describe('1 of beta_brousouf currency', function(){

    // Loads amTest with its data
    before(function(done) {
    amTest = new Amendment();
      fs.readFile(__dirname + "/data/amendments/BB-AM1-OK", {encoding: "utf8"}, function (err, data) {
        amTest.parse(data, function(err) {
          done(err);
        });
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

    it('should have 6F4ACBC7A25A0AAB9B58778EAD5A297EF3E51D00 previous hash', function(){
      assert.equal(amTest.previousHash, '6F4ACBC7A25A0AAB9B58778EAD5A297EF3E51D00');
    });

    it('should have 0 new members', function(){
      var newMembers = amTest.getNewMembers();
      assert.equal(newMembers.length, 0);
      assert.equal(amTest.membersCount, 3);
    });

    it('should have 0 new voters', function(){
      var newVoters = amTest.getNewVoters();
      assert.equal(newVoters.length, 0);
      assert.equal(amTest.votersCount, 3);
    });
  });

  describe('2 of beta_brousouf currency', function(){

    // Loads amTest with its data
    before(function(done) {
      amTest = new Amendment();
      fs.readFile(__dirname + "/data/amendments/BB-AM2-OK", {encoding: "utf8"}, function (err, data) {
        amTest.parse(data, function(err) {
          done(err);
        });
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

    it('should have a niversal Dividend of value 100', function(){
      assert.equal(amTest.dividend, 100);
    });

    it('should have a Minimal Coin Power of 0', function(){
      assert.equal(amTest.coinMinPower, 0);
    });

    it('should have 3E6EDD8CF1391AFADB3E3619B3A131E9300B963F previous hash', function(){
      assert.equal(amTest.previousHash, '3E6EDD8CF1391AFADB3E3619B3A131E9300B963F');
    });

    it('should have D092366E448D18C0E72D7C7976A647A122B55225 members hash', function(){
      assert.equal(amTest.membersRoot, 'D092366E448D18C0E72D7C7976A647A122B55225');
    });

    it('should have DC7A9229DFDABFB9769789B7BFAE08048BCB856F voters hash', function(){
      assert.equal(amTest.votersRoot, 'DC7A9229DFDABFB9769789B7BFAE08048BCB856F');
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
  });

  describe('2 (WRONG-UD ONE) of beta_brousouf currency', function(){

    var errCode = 0;
    // Loads amTest with its data
    before(function(done) {
      amTest = new Amendment();
      fs.readFile(__dirname + "/data/amendments/BB-AM2-WRONG-UD", {encoding: "utf8"}, function (err, data) {
        amTest.parse(data, function(err) {
          amTest.verify({name: "beta_brousouf"}, function(err, code) {
            errCode = code;
            done();
          });
        });
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

    it('should have a niversal Dividend of value 122', function(){
      assert.equal(amTest.dividend, 122);
    });

    it('should have a Minimal Coin Power of 3', function(){
      assert.equal(amTest.coinMinPower, 3);
    });

    it('should have verification error code 108', function(){
      assert.equal(errCode, 108);
    });
  });
});