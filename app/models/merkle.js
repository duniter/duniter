var sha1      = require('sha1');
var async     = require('async');
var merkle    = require('merkle');
var mongoose  = require('mongoose');
var fs        = require('fs');
var Schema    = mongoose.Schema;

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

  init: function (leaves) {
    var tree = merkle(leaves, 'sha1').process();
    this.depth = tree.depth();
    this.nodes = tree.nodes();
    this.leaves = leaves.length;
    this.levels = [];
    for (var i = 0; i < tree.levels(); i++) {
      this.levels[i] = tree.level(i);
    }
  }
};

var Merkle = mongoose.model('Merkle', MerkleSchema);
