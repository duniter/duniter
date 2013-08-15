var sha1      = require('sha1');
var async     = require('async');
var merkle    = require('merkle');
var mongoose  = require('mongoose');
var _         = require('underscore');
var fs        = require('fs');
var Schema    = mongoose.Schema;
var Amendment = mongoose.model('Amendment');

var MerkleSchema = new Schema({
  type: String,
  criteria: String,
  depth: {"type": Number, "default": 0},
  nodes: {"type": Number, "default": 0},
  leaves: {"type": Number, "default": 0},
  levels: Array,
  created: Date,
  updated: Date
});

MerkleSchema.methods = {

  initialize: function (leaves) {
    var tree = merkle(leaves, 'sha1').process();
    this.depth = tree.depth();
    this.nodes = tree.nodes();
    this.leaves = leaves.length;
    this.levels = [];
    for (var i = 0; i < tree.levels(); i++) {
      this.levels[i] = tree.level(i);
    }
  },

  push: function (leaf) {
    if(this.levels[this.depth].indexOf(leaf) == -1){
      var leaves = this.levels[this.depth];
      leaves.push(leaf);
      leaves.sort();
      this.initialize(leaves);
    }
  },

  root: function () {
    return this.levels.length > 0 ? this.levels[0][0] : '';
  }
};

MerkleSchema.statics.forMembership = function (number, done) {
  var merkleID = { type: 'membership', criteria: '{"basis":'+number+'}' };
  async.waterfall([
    function(next){
      Merkle.findOne(merkleID, next);
    },
    function(merkle, next){
      if(!merkle){
        merkle = new Merkle(merkleID);
        merkle.initialize([]);
      }
      next(null, merkle);
    }
  ], done);
};

MerkleSchema.statics.forNextMembership = function (done) {
  var that = this;
  Amendment.nextNumber(function (err, number) {
    that.forMembership(number, done);
  });
};

MerkleSchema.statics.forAmendment = function (number, hash, done) {
  var merkleID = { type: 'amendment', criteria: '{"number":'+number+',"hash": "'+hash+'"}' };
  async.waterfall([
    function(next){
      Merkle.findOne(merkleID, next);
    },
    function(merkle, next){
      if(!merkle){
        merkle = new Merkle(merkleID);
        merkle.initialize([]);
      }
      next(null, merkle);
    }
  ], done);
};

var Merkle = mongoose.model('Merkle', MerkleSchema);
