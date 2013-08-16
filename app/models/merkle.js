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
  levels: Array,
  created: Date,
  updated: Date
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
  },

  push: function (leaf) {
    if(this.levels[this.depth].indexOf(leaf) == -1){
      var leaves = this.leaves();
      leaves.push(leaf);
      leaves.sort();
      this.initialize(leaves);
    }
  },

  root: function () {
    return this.levels.length > 0 ? this.levels[0][0] : '';
  },

  leaves: function () {
    return this.levels[this.depth];
  }
};

function retrieve(merkleID, done) {
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

MerkleSchema.statics.forMembership = function (number, done) {
  retrieve({ type: 'membership', criteria: '{"basis":'+number+'}' }, done);
};

MerkleSchema.statics.forNextMembership = function (done) {
  var that = this;
  Amendment.nextNumber(function (err, number) {
    that.forMembership(number, done);
  });
};

MerkleSchema.statics.signaturesOfAmendment = function (number, hash, done) {
  retrieve({ type: 'amendment', criteria: '{"number":'+number+',"hash": "'+hash+'"}' }, done);
};

MerkleSchema.statics.signaturesWrittenForAmendment = function (number, hash, done) {
  retrieve({ type: 'amendment_signatures', criteria: '{"number":'+number+',"hash": "'+hash+'"}' }, done);
};

MerkleSchema.statics.membershipsWrittenForAmendment = function (number, hash, done) {
  retrieve({ type: 'amendment_memberships', criteria: '{"number":'+number+',"hash": "'+hash+'"}' }, done);
};

MerkleSchema.statics.membersWrittenForAmendment = function (number, hash, done) {
  retrieve({ type: 'amendment_members', criteria: '{"number":'+number+',"hash": "'+hash+'"}' }, done);
};

MerkleSchema.statics.votersWrittenForAmendment = function (number, hash, done) {
  retrieve({ type: 'amendment_voters', criteria: '{"number":'+number+',"hash": "'+hash+'"}' }, done);
};

MerkleSchema.statics.signatoriesOfAmendment = function (number, hash, done) {
  retrieve({ type: 'amendment_signatories', criteria: '{"number":'+number+',"hash": "'+hash+'"}' }, done);
};

MerkleSchema.statics.processForURL = function (req, merkle, valueCB, done) {
  // Level
  var lstart = req.query.lstart ? parseInt(req.query.lstart) : 0;
  var lend   = req.query.lend ? parseInt(req.query.lend) : lstart + 1;
  if(req.query.extract){
    lstart = merkle.depth;
    lend = lstart + 1;
  }
  // Start
  var start = req.query.start ? parseInt(req.query.start) : 0;
  // End
  var end = req.query.end ? parseInt(req.query.end) : merkle.levels[merkle.depth.length];
  // Result
  var json = {
    "merkle": {
      "depth": merkle.depth,
      "nodesCount": merkle.nodes,
      "levelsCount": merkle.levels.length
    }
  };
  if(isNaN(lstart)) lstart = 0;
  if(isNaN(lend)) lend = lstart + 1;
  if(isNaN(start)) start = 0;
  if(!req.query.extract){
    json.merkle.levels = [];
    for (var i = Math.max(lstart, 0); i < merkle.levels.length && i < lend; i++) {
      var rowEnd = isNaN(end) ? merkle.levels[i].length : end;
      json.merkle.levels.push({
        "level": i,
        "nodes": merkle.levels[i].slice(Math.max(start, 0), Math.min(rowEnd, merkle.levels[i].length))
      });
    };
    done(null, json);
  }
  else {
    json.merkle.leaves = [];
    var rowEnd = isNaN(end) ? merkle.levels[merkle.depth].length : end;
    var hashes = merkle.levels[merkle.depth].slice(Math.max(start, 0), Math.min(rowEnd, merkle.levels[lstart].length));
    valueCB(hashes, function (err, values) {
      hashes.forEach(function (hash, index){
        json.merkle.leaves.push({
          "index": index,
          "hash": merkle.levels[lstart][index],
          "value": values[hash]
        });
      });
      done(null, json);
    });
  }
}

var Merkle = mongoose.model('Merkle', MerkleSchema);
