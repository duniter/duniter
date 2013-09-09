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

  root: function () {
    return this.levels.length > 0 ? this.levels[0][0] : '';
  },

  leaves: function () {
    return this.levels[this.depth];
  }
};

function retrieve(merkleID, done) {
  // console.log(merkleID, done);
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
    that.forMembership(number || 0, done);
  });
};

MerkleSchema.statics.forPublicKeys = function (done) {
  retrieve({ type: 'pubkeys' }, done);
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

MerkleSchema.statics.txAll = function (done) {
  retrieve({ type: 'txAll', criteria: '{}' }, done);
};

MerkleSchema.statics.txOfSender = function (fingerprint, done) {
  retrieve({ type: 'txOfSender', criteria: '{"fpr":'+fingerprint+'"}' }, done);
};

MerkleSchema.statics.txIssuanceOfSender = function (fingerprint, done) {
  retrieve({ type: 'txIssuanceOfSender', criteria: '{"fpr":"'+fingerprint+'"}' }, done);
};

MerkleSchema.statics.txDividendOfSender = function (fingerprint, done) {
  retrieve({ type: 'txDividendOfSender', criteria: '{"fpr":"'+fingerprint+'"}' }, done);
};

MerkleSchema.statics.txDividendOfSenderByAmendment = function (fingerprint, amNumber, done) {
  retrieve({ type: 'txDividendOfSender', criteria: '{"fpr":"'+fingerprint+'",am":'+amNumber+'"}' }, done);
};

MerkleSchema.statics.txFusionOfSender = function (fingerprint, done) {
  retrieve({ type: 'txFusionOfSender', criteria: '{"fpr":"'+fingerprint+'"}' }, done);
};

MerkleSchema.statics.txTransfertOfSender = function (fingerprint, done) {
  retrieve({ type: 'txTransfertOfSender', criteria: '{"fpr":"'+fingerprint+'"}' }, done);
};

MerkleSchema.statics.txToRecipient = function (fingerprint, done) {
  retrieve({ type: 'txToRecipient', criteria: '{"fpr":"'+fingerprint+'"}' }, done);
};

MerkleSchema.statics.peers = function (done) {
  retrieve({ type: 'peers', criteria: '{}' }, done);
};

MerkleSchema.statics.keys = function (done) {
  retrieve({ type: 'keys', criteria: '{}' }, done);
};

MerkleSchema.statics.updatePeers = function (peer, previousHash, done) {
  async.waterfall([
    function (next) {
      Merkle.peers(next);
    },
    function (merkle, next) {
      merkle.push(peer.hash, previousHash);
      merkle.save(function (err) {
        next(err);
      });
    }
  ], done);
};

MerkleSchema.statics.addPublicKey = function (fingerprint, done) {
  async.waterfall([
    function (next) {
      Merkle.forPublicKeys(function (err, merkle) {
        next(err, merkle);
      });
    },
    function (merkle, next) {
      merkle.push(fingerprint);
      merkle.save(function (err) {
        next(err);
      });
    }
  ], done);
};

MerkleSchema.statics.updateSignaturesOfAmendment = function (am, previousHash, newHash, done) {
  async.waterfall([
    function (next) {
      Merkle.signaturesOfAmendment(am.number, am.hash, function (err, merkle) {
        next(err, merkle);
      });
    },
    function (merkle, next) {
      merkle.push(newHash, previousHash);
      merkle.save(function (err) {
        next(err);
      });
    }
  ], done);
};

MerkleSchema.statics.updateSignatoriesOfAmendment = function (am, fingerprint, done) {
  async.waterfall([
    function (next) {
      Merkle.signatoriesOfAmendment(am.number, am.hash, function (err, merkle) {
        next(err, merkle);
      });
    },
    function (merkle, next) {
      merkle.push(fingerprint);
      merkle.save(function (err) {
        next(err);
      });
    }
  ], done);
};

MerkleSchema.statics.updateForNextMembership = function (previousHash, newHash, done) {
  async.waterfall([
    function (next) {
      Merkle.forNextMembership(function (err, merkle) {
        next(err, merkle);
      });
    },
    function (merkle, next) {
      merkle.push(newHash, previousHash);
      merkle.save(function (err) {
        next(err);
      });
    }
  ], done);
};

MerkleSchema.statics.updateForIssuance = function (tx, am, done) {
  async.waterfall([
    function (next) {
      // M All
      Merkle.txAll(next);
    },
    function (merkle, next){
      merkle.push(tx.hash);
      merkle.save(next);
    },
    function (merkle, code, next){
      // M1
      Merkle.txOfSender(tx.sender, next);
    },
    function (merkle, next){
      merkle.push(tx.hash);
      merkle.save(next);
    },
    function (merkle, code, next){
      // M2
      Merkle.txIssuanceOfSender(tx.sender, next);
    },
    function (merkle, next){
      merkle.push(tx.hash);
      merkle.save(next);
    },
    function (merkle, code, next){
      // M3
      Merkle.txDividendOfSender(tx.sender, next);
    },
    function (merkle, next){
      merkle.push(tx.hash);
      merkle.save(next);
    },
    function (merkle, code, next){
      // M4
      Merkle.txDividendOfSenderByAmendment(tx.sender, am.number, next);
    },
    function (merkle, next){
      merkle.push(tx.hash);
      merkle.save(next);
    },
    function (merkle, code, next){
      // M7
      Merkle.txToRecipient(tx.recipient, next);
    },
    function (merkle, next){
      merkle.push(tx.hash);
      merkle.save(next);
    }
  ], done);
};

MerkleSchema.statics.updateForTransfert = function (tx, done) {
  async.waterfall([
    function (next) {
      // M All
      Merkle.txAll(next);
    },
    function (merkle, next){
      merkle.push(tx.hash);
      merkle.save(next);
    },
    function (merkle, code, next){
      // M1
      Merkle.txOfSender(tx.sender, next);
    },
    function (merkle, next){
      merkle.push(tx.hash);
      merkle.save(next);
    },
    function (merkle, code, next){
      // M6
      Merkle.txTransfertOfSender(tx.sender, next);
    },
    function (merkle, next){
      merkle.push(tx.hash);
      merkle.save(next);
    },
    function (merkle, code, next){
      // M7
      Merkle.txToRecipient(tx.recipient, next);
    },
    function (merkle, next){
      merkle.push(tx.hash);
      merkle.save(next);
    }
  ], done);
};

MerkleSchema.statics.updateForFusion = function (tx, done) {
  async.waterfall([
    function (next) {
      // M All
      Merkle.txAll(next);
    },
    function (merkle, next){
      merkle.push(tx.hash);
      merkle.save(next);
    },
    function (merkle, code, next){
      // M1
      Merkle.txOfSender(tx.sender, next);
    },
    function (merkle, next){
      merkle.push(tx.hash);
      merkle.save(next);
    },
    function (merkle, code, next){
      // M2
      Merkle.txIssuanceOfSender(tx.sender, next);
    },
    function (merkle, next){
      merkle.push(tx.hash);
      merkle.save(next);
    },
    function (merkle, code, next){
      // M5
      Merkle.txFusionOfSender(tx.sender, next);
    },
    function (merkle, next){
      merkle.push(tx.hash);
      merkle.save(next);
    },
    function (merkle, code, next){
      // M7
      Merkle.txToRecipient(tx.recipient, next);
    },
    function (merkle, next){
      merkle.push(tx.hash);
      merkle.save(next);
    }
  ], done);
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
      "levelsCount": merkle.levels.length,
      "leavesCount": merkle.levels[merkle.depth].length
    }
  };
  if(isNaN(lstart)) lstart = 0;
  if(isNaN(lend)) lend = lstart + 1;
  if(isNaN(start)) start = 0;
  if(!req.query.extract || !valueCB){
    json.merkle.levels = {};
    for (var i = Math.max(lstart, 0); i < merkle.levels.length && i < lend; i++) {
      var rowEnd = isNaN(end) ? merkle.levels[i].length : end;
      json.merkle.levels[i] = merkle.levels[i].slice(Math.max(start, 0), Math.min(rowEnd, merkle.levels[i].length));
    };
    done(null, json);
  }
  else {
    json.merkle.leaves = {};
    var rowEnd = isNaN(end) ? merkle.levels[merkle.depth].length : end;
    var hashes = merkle.levels[merkle.depth].slice(Math.max(start, 0), Math.min(rowEnd, merkle.levels[lstart].length));
    valueCB(hashes, function (err, values) {
      hashes.forEach(function (hash, index){
        json.merkle.leaves[Math.max(start, 0) + index] = {
          "hash": hash,
          "value": values[hash] || ""
        };
      });
      done(null, json);
    });
  }
}

var Merkle = mongoose.model('Merkle', MerkleSchema);
