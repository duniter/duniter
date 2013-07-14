var should   = require('should');
var assert   = require('assert');
var fs       = require('fs');
var mongoose = require('mongoose');
var nodecoin = require('../app/lib/nodecoin');


nodecoin.database.init();
var Amendment = mongoose.model('Amendment');

var amTest = new Amendment();

describe('Amendments', function(){
  describe('structure test', function(){

    // Loads amTest with its data
    beforeEach(function(done) {
      fs.readFile(__dirname + "/data/amendments/BB-AM0-OK", {encoding: "utf8"}, function (err, data) {
        amTest.parse(data, function(err) {
          done(err);
        });
      });
    });

    it('should be version 1', function(){
      assert.equal(amTest.version, 1);
    });

    it('should have 3 new members', function(){
      var members = amTest.getNewMembers();
      assert.equal(members.length, 3);
      assert.equal(members[0], "2E69197FAB029D8669EF85E82457A1587CA0ED9C");
      assert.equal(members[1], "33BBFC0C67078D72AF128B5BA296CC530126F372");
      assert.equal(members[2], "C73882B64B7E72237A2F460CE9CAB76D19A8651E");
    });

    // More tests here ...
  });
});