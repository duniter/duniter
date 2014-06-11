var should   = require('should');
var assert   = require('assert');
var sha1     = require('sha1');
var fs       = require('fs');
var mongoose = require('mongoose');
var ucoin    = require('./..');

var Merkle = mongoose.model('Merkle', require('../app/models/merkle'));

describe("Merkle ['a', 'b', 'c', 'd', 'e']", function(){

  var m = new Merkle({ type: 'CollectionName', criteria: '{}'});
  m.initialize(['a', 'b', 'c', 'd', 'e']);

  it('should have root 114B6E61CB5BB93D862CA3C1DFA8B99E313E66E9', function(){
    assert.equal(m.levels[0], '114B6E61CB5BB93D862CA3C1DFA8B99E313E66E9');
  });

  it('should have level 1,0 585DD1B0A3A55D9A36DE747EC37524D318E2EBEE', function(){
    assert.equal(m.levels[1][0], '585DD1B0A3A55D9A36DE747EC37524D318E2EBEE');
  });

  it('should have level 1,1 58E6B3A414A1E090DFC6029ADD0F3555CCBA127F', function(){
    assert.equal(m.levels[1][1], '58E6B3A414A1E090DFC6029ADD0F3555CCBA127F');
  });

  it('should have 4 levels', function(){
    assert.equal(m.levels.length, 4);
  });

  it('should have depth: 3', function(){
    assert.equal(m.depth, 3);
  });

  it('should have 6 nodes', function(){
    assert.equal(m.nodes, 6);
  });

  it('should have 5 leaves', function(){
    assert.equal(m.leaves().length, 5);
  });
});

describe("Merkle []", function(){

  var m = new Merkle({ type: 'CollectionName', criteria: '{}'});
  m.initialize([]);

  it('should have root empty', function(){
    assert.equal(m.levels[0], '');
  });

  it('should have 1 levels', function(){
    assert.equal(m.levels.length, 1);
  });

  it('should have depth: 0', function(){
    assert.equal(m.depth, 0);
  });

  it('should have 0 nodes', function(){
    assert.equal(m.nodes, 0);
  });

  it('should have 0 leaves', function(){
    assert.equal(m.leaves().length, 0);
  });
});
