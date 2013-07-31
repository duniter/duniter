var should    = require('should');
var assert    = require('assert');
var mongoose  = require('mongoose');
var sha1      = require('sha1');
var fs        = require('fs');
var async     = require('async');
var nodecoin  = require('../app/lib/nodecoin');
nodecoin.database.init();
var Amendment = mongoose.model('Amendment');
var Vote      = mongoose.model('Vote');

describe('Votes for', function(){

  describe('-beta_brousouf- AM0', function(){

    var tests = {
      cat: {
        vote: new Vote({"issuer": "C73882B64B7E72237A2F460CE9CAB76D19A8651E"}),
        file: __dirname + "/data/votes/BB-AM0/BB-AM0-OK-LOLCAT.asc",
        amend: __dirname + "/data/amendments/BB-AM0-OK",
        pubKey: __dirname + "/data/lolcat.pub",
        verified: false
      },
      john: {
        vote: new Vote({"issuer": "33BBFC0C67078D72AF128B5BA296CC530126F372"}),
        file: __dirname + "/data/votes/BB-AM0/BB-AM0-OK-JOHNSNOW.asc",
        amend: __dirname + "/data/amendments/BB-AM0-OK",
        pubKey: __dirname + "/data/snow.pub",
        verified: false
      },
      tobi: {
        vote: new Vote({"issuer": "2E69197FAB029D8669EF85E82457A1587CA0ED9C"}),
        file: __dirname + "/data/votes/BB-AM0/BB-AM0-OK-UCHIWA.asc",
        amend: __dirname + "/data/amendments/BB-AM0-OK",
        pubKey: __dirname + "/data/uchiha.pub",
        verified: false
      },
      cat2: {
        vote: new Vote({"issuer": "C73882B64B7E72237A2F460CE9CAB76D19A8651E"}),
        file: __dirname + "/data/votes/BB-AM0/BB-AM0-WRONG-LOLCAT.asc",
        amend: __dirname + "/data/amendments/BB-AM0-OK",
        pubKey: __dirname + "/data/lolcat.pub",
        verified: false
      },
    };

    before(function (done) {
      async.forEach([tests.cat, tests.john, tests.tobi, tests.cat2], function (test, callback) {
        test.vote.loadFromFiles(test.file, test.amend, function (err) {
          if(!err){
            fs.readFile(test.pubKey, {encoding: "utf8"}, function (err, pkData) {
              test.vote.publicKey = pkData;
              test.vote.verify(function (err) {
                if(!err) test.verified = true;
                callback();
              });
            });
          }
          else callback(err);
        });
      }, done);
    });

    it('legit LOL CAT vote should be verified', function(){
      (tests.cat.verified).should.be.ok;
    });

    it('legit JOHN SNOW vote should be verified', function(){
      (tests.john.verified).should.be.ok;
    });

    it('legit OBITO UCHIWA vote should be verified', function(){
      (tests.tobi.verified).should.be.ok;
    });

    it('non-legit CAT vote should not be verified', function(){
      (tests.cat2.verified).should.not.be.ok;
    });
  });
});
