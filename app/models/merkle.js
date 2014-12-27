var sha1       = require('sha1');
var async      = require('async');
var merkle     = require('merkle');
var mongoose   = require('mongoose');
var _          = require('underscore');
var fs         = require('fs');
var Schema     = mongoose.Schema;

var MerkleSchema = new Schema({
  type: String,
  criteria: String,
  depth: {"type": Number, "default": 0},
  nodes: {"type": Number, "default": 0},
  levels: Array,
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

MerkleSchema.pre('save', function (next) {
  this.updated = Date.now();
  next();
});

MerkleSchema.methods = {

  initialize: function (leaves) {
    var tree = merkle(leaves, 'sha1').process();
    this.depth = tree.depth();
    this.nodes = tree.nodes();
    this.levels = [];
    for (var i = 0; i < tree.levels(); i++) {
      this.levels[i] = tree.level(i);
    }
    return this;
  },

  remove: function (leaf) {
    // If leaf IS present
    if(~this.levels[this.depth].indexOf(leaf)){
      var leaves = this.leaves();
      var index = leaves.indexOf(leaf);
      if(~index){
        // Replacement: remove previous hash
        leaves.splice(index, 1);
      }
      leaves.sort();
      this.initialize(leaves);
    }
  },

  removeMany: function (leaves) {
    leaves.forEach(function(leaf){
      // If leaf IS present
      if(~this.levels[this.depth].indexOf(leaf)){
        var leaves = this.leaves();
        var index = leaves.indexOf(leaf);
        if(~index){
          // Replacement: remove previous hash
          leaves.splice(index, 1);
        }
      }
    });
    leaves.sort();
    this.initialize(leaves);
  },

  push: function (leaf, previous) {
    // If leaf is not present
    if(this.levels[this.depth].indexOf(leaf) == -1){
      var leaves = this.leaves();
      // Update or replacement ?
      if(previous && leaf != previous){
        var index = leaves.indexOf(previous);
        if(~index){
          // Replacement: remove previous hash
          leaves.splice(index, 1);
        }
      }
      leaves.push(leaf);
      leaves.sort();
      this.initialize(leaves);
    }
  },

  pushMany: function (leaves) {
    var that = this;
    leaves.forEach(function (leaf) {
      // If leaf is not present
      if(that.levels[that.depth].indexOf(leaf) == -1){
        that.leaves().push(leaf);
      }
    });
    leaves.sort();
    this.initialize(leaves);
  },

  root: function () {
    return this.levels.length > 0 ? this.levels[0][0] : '';
  },

  leaves: function () {
    return this.levels[this.depth];
  },

  count: function () {
    return this.leaves().length;
  }
};

MerkleSchema.statics.retrieve = function(merkleID, done) {
  var Merkle = this.model('Merkle');
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
}

MerkleSchema.statics.peers = function (done) {
  this.retrieve({ type: 'peers', criteria: '{}' }, done);
};

MerkleSchema.statics.updatePeers = function (peer, previousHash, done) {
  var Merkle = this.model('Merkle');
  async.waterfall([
    function (next) {
      Merkle.peers(next);
    },
    function (merkle, next) {
      merkle.push(peer.fingerprint, previousHash);
      merkle.save(function (err) {
        next(err);
      });
    }
  ], done);
};

MerkleSchema.statics.updateForPeers = function (done) {
  var Merkle = this.model('Merkle');
  var Peer = this.model('Peer');
  async.waterfall([
    function (next) {
      async.parallel({
        peers: function (next) {
          Peer.allNEWUPBut([], next);
        },
        merkle: function (next) {
          Merkle.peers(next);
        }
      }, next);
    },
    function (res, next) {
      var peers = res.peers;
      var merkle = res.merkle;
      var leaves = [];
      peers.forEach(function (p) {
        leaves.push(p.hash);
      });
      merkle.initialize(leaves);
      merkle.save(function (err) {
        next(err);
      });
    }
  ], done);
};

MerkleSchema.statics.mapIdentical = function (hashes, done) {
  var map = {};
  hashes.forEach(function (leaf) {
    map[leaf] = leaf;
  });
  done(null, map);
};

module.exports = MerkleSchema;
