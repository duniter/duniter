var should   = require('should');
var assert   = require('assert');
var fs       = require('fs');
var mongoose = require('mongoose');
var async    = require('async');
var nodecoin = require('../app/lib/nodecoin');
var merkle   = require('../app/lib/merkle');

var merkleM0, merkleM2, merkleV0, merkleV2;

before(function(done) {

  var members0 = [];
  var members2 = [];
  var voters0 = [];
  var voters2 = [];

  async.waterfall([
    function(callback){
      members0 = [
        "2E69197FAB029D8669EF85E82457A1587CA0ED9C",
        "C73882B64B7E72237A2F460CE9CAB76D19A8651E",
        "33BBFC0C67078D72AF128B5BA296CC530126F372"
      ];
      members0.sort();
      voters0 = members0.slice();
      // Merkle
      merkleM0 = merkle(members0);
      merkleV0 = merkle(voters0);
      callback();
    },
    function(callback){
      members2 = members0.slice();
      members2.push("31A6302161AC8F5938969E85399EB3415C237F93");
      members2.sort();
      voters2 = voters0.slice();
      voters2.splice(voters2.indexOf('C73882B64B7E72237A2F460CE9CAB76D19A8651E'));
      // Merkle
      merkleM2 = merkle(members2);
      merkleV2 = merkle(voters2);
      callback();
    }
  ], function (err, result) {
    var merkles = [merkleM0, merkleM2, merkleV0, merkleV2];
    async.forEach(merkles, function(merkle, cb) {
      merkle.process(cb);
    }, done);
  });
});

describe('Merkle', function(){

  describe('of BB-AM0-OK', function(){

    it('voters root should be F5ACFD67FC908D28C0CFDAD886249AC260515C90', function(){
      assert.equal(merkleV0.getRoot(), "F5ACFD67FC908D28C0CFDAD886249AC260515C90");
    });

    it('members root should be F5ACFD67FC908D28C0CFDAD886249AC260515C90', function(){
      assert.equal(merkleM0.getRoot(), "F5ACFD67FC908D28C0CFDAD886249AC260515C90");
    });
  });

  describe('of BB-AM2-OK', function(){

    it('voters root should be DC7A9229DFDABFB9769789B7BFAE08048BCB856F', function(){
      assert.equal(merkleV2.getRoot(), "DC7A9229DFDABFB9769789B7BFAE08048BCB856F");
    });

    it('members root should be F92B6F81C85200250EE51783F5F9F6ACA57A9AFF', function(){
      assert.equal(merkleM2.getRoot(), "F92B6F81C85200250EE51783F5F9F6ACA57A9AFF");
    });
  });
});