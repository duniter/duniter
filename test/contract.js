var should    = require('should');
var assert    = require('assert');
var fs        = require('fs');
var mongoose  = require('mongoose');
var sha1      = require('sha1');
var async     = require('async');
var server    = require('../app/lib/server');
server.database.init();
var Amendment = mongoose.model('Amendment');
var Contract  = mongoose.model('Contract');

describe('Monetary Contract', function(){

  describe('-beta_brousouf- 3 amendments', function(){

    var MonetaryContract = new Contract({
      currency: "beta_brousouf",
      initKeys: [
      "2E69197FAB029D8669EF85E82457A1587CA0ED9C",
      "33BBFC0C67078D72AF128B5BA296CC530126F372",
      "C73882B64B7E72237A2F460CE9CAB76D19A8651E"
    ]});

    before(function (done) {
      initContract(MonetaryContract, ["BB-AM0-OK", "BB-AM1-OK", "BB-AM2-OK"], done);
    });

    it('should have a length of 3', function(){
      assert.equal(MonetaryContract.length, 3);
    });

    it('should have Monetary Mass of 440', function(){
      assert.equal(MonetaryContract.monetaryMass, 440);
    });

    it('should have 4 members, 2 voters', function(){
      assert.equal(MonetaryContract.members.length, 4);
      assert.equal(MonetaryContract.voters.length, 2);
      assert.equal(MonetaryContract.members[0], "2E69197FAB029D8669EF85E82457A1587CA0ED9C");
      assert.equal(MonetaryContract.members[1], "33BBFC0C67078D72AF128B5BA296CC530126F372");
      assert.equal(MonetaryContract.members[2], "B6AE93DDE390B1E11FA97EEF78B494F99025C77E");
      assert.equal(MonetaryContract.members[3], "C73882B64B7E72237A2F460CE9CAB76D19A8651E");
      assert.equal(MonetaryContract.voters[0], "2E69197FAB029D8669EF85E82457A1587CA0ED9C");
      assert.equal(MonetaryContract.voters[1], "33BBFC0C67078D72AF128B5BA296CC530126F372");
    });
  });

  describe('-beta_brousouf- 2 amendments', function(){

    var MonetaryContract = new Contract({
      currency: "beta_brousouf",
      initKeys: [
      "2E69197FAB029D8669EF85E82457A1587CA0ED9C",
      "33BBFC0C67078D72AF128B5BA296CC530126F372",
      "C73882B64B7E72237A2F460CE9CAB76D19A8651E"
    ]});

    before(function (done) {
      initContract(MonetaryContract, ["BB-AM0-OK", "BB-AM1-OK"], done);
    });

    it('should have a length of 2', function(){
      assert.equal(MonetaryContract.length, 2);
    });

    it('should have Monetary Mass of 0', function(){
      assert.equal(MonetaryContract.monetaryMass, 0);
    });

    it('should have 3 members, 3 voters', function(){
      assert.equal(MonetaryContract.members.length, 3);
      assert.equal(MonetaryContract.voters.length, 3);
      assert.equal(MonetaryContract.members[0], "2E69197FAB029D8669EF85E82457A1587CA0ED9C");
      assert.equal(MonetaryContract.members[1], "33BBFC0C67078D72AF128B5BA296CC530126F372");
      assert.equal(MonetaryContract.members[2], "C73882B64B7E72237A2F460CE9CAB76D19A8651E");
      assert.equal(MonetaryContract.voters[0], "2E69197FAB029D8669EF85E82457A1587CA0ED9C");
      assert.equal(MonetaryContract.voters[1], "33BBFC0C67078D72AF128B5BA296CC530126F372");
      assert.equal(MonetaryContract.voters[2], "C73882B64B7E72237A2F460CE9CAB76D19A8651E");
    });
  });

  describe('-beta_brousouf- with wrong votes for AM2', function(){

    var MonetaryContract = new Contract({
      currency: "beta_brousouf",
      initKeys: [
      "2E69197FAB029D8669EF85E82457A1587CA0ED9C",
      "33BBFC0C67078D72AF128B5BA296CC530126F372",
      "C73882B64B7E72237A2F460CE9CAB76D19A8651E"
    ]});

    before(function (done) {
      initContract(MonetaryContract, ["BB-AM0-OK", "BB-AM1-OK", "BB-AM2-WRONG-VOTES"], function (err) {
        done();
      });
    });

    it('should have a length of 2', function(){
      assert.equal(MonetaryContract.length, 2);
    });

    it('should have Monetary Mass of 0', function(){
      assert.equal(MonetaryContract.monetaryMass, 0);
    });

    it('should have 3 members, 3 voters', function(){
      assert.equal(MonetaryContract.members.length, 3);
      assert.equal(MonetaryContract.voters.length, 3);
      assert.equal(MonetaryContract.members[0], "2E69197FAB029D8669EF85E82457A1587CA0ED9C");
      assert.equal(MonetaryContract.members[1], "33BBFC0C67078D72AF128B5BA296CC530126F372");
      assert.equal(MonetaryContract.members[2], "C73882B64B7E72237A2F460CE9CAB76D19A8651E");
      assert.equal(MonetaryContract.voters[0], "2E69197FAB029D8669EF85E82457A1587CA0ED9C");
      assert.equal(MonetaryContract.voters[1], "33BBFC0C67078D72AF128B5BA296CC530126F372");
      assert.equal(MonetaryContract.voters[2], "C73882B64B7E72237A2F460CE9CAB76D19A8651E");
    });
  });
});

function initContract (monetaryContract, files, done) {
  // Loading amendments...
  var amendments = [];
  async.forEachSeries(files, function (file, callback) {
    var fullPath = __dirname + "/data/amendments/" + file;
    var am = new Amendment();
    amendments.push(am);
    am.loadFromFile(fullPath, callback);
  }, function (err) {
    monetaryContract.feedAll(amendments, done);
  });
}