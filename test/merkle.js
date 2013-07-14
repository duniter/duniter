var should   = require('should');
var assert   = require('assert');
var fs       = require('fs');
var mongoose = require('mongoose');
var nodecoin = require('../app/lib/nodecoin');
var merkle   = require('../app/lib/merkle');


nodecoin.database.init();
var Amendment = mongoose.model('Amendment');

var amTest = new Amendment();
var m;

// Loads amTest with its data
before(function(done) {
  fs.readFile(__dirname + "/data/amendments/BB-AM0-OK", {encoding: "utf8"}, function (err, data) {
    amTest.parse(data, function(err) {
      done(err);
    });
  });
});

describe('Merkle', function(){
  describe('with BB-AM0-OK', function(){

    before(function(done) {
      var members = amTest.getNewMembers();
      m = merkle(members);
      m.process(done);
    });

    it('voters root should be equals to ', function(){
      assert.equal(m.levels[0], "F5ACFD67FC908D28C0CFDAD886249AC260515C90");
    });

    // More tests here ...
  });
});