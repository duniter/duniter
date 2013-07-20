var should    = require('should');
var assert    = require('assert');
var fs        = require('fs');
var mongoose  = require('mongoose');
var sha1      = require('sha1');
var async     = require('async');
var nodecoin  = require('../app/lib/nodecoin');
nodecoin.database.init();
var Amendment = mongoose.model('Amendment');
var contract  = require('../app/lib/contract');

describe('Monetary Contract', function(){

  describe('-beta_brousouf-', function(){

    var MonetaryContract = new contract("beta_brousouf", [
      "2E69197FAB029D8669EF85E82457A1587CA0ED9C",
      "33BBFC0C67078D72AF128B5BA296CC530126F372",
      "C73882B64B7E72237A2F460CE9CAB76D19A8651E"
    ]);

    before(function (done) {
      initContract(MonetaryContract, ["BB-AM0-OK", "BB-AM1-OK", "BB-AM2-OK"], done);
    });

    it('should have a length of 3', function(){
      assert.equal(MonetaryContract.length, 3);
    });

    it('should have Monetary Mass of 400', function(){
      assert.equal(MonetaryContract.monetaryMass, 400);
    });

    it('should have 4 members, 2 voters', function(){
      assert.equal(MonetaryContract.members.length, 4);
      assert.equal(MonetaryContract.voters.length, 2);
      assert.equal(MonetaryContract.members[0], "2E69197FAB029D8669EF85E82457A1587CA0ED9C");
      assert.equal(MonetaryContract.members[1], "31A6302161AC8F5938969E85399EB3415C237F93");
      assert.equal(MonetaryContract.members[2], "33BBFC0C67078D72AF128B5BA296CC530126F372");
      assert.equal(MonetaryContract.members[3], "C73882B64B7E72237A2F460CE9CAB76D19A8651E");
      assert.equal(MonetaryContract.voters[0], "2E69197FAB029D8669EF85E82457A1587CA0ED9C");
      assert.equal(MonetaryContract.voters[1], "33BBFC0C67078D72AF128B5BA296CC530126F372");
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