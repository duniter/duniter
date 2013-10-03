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

MerkleSchema.statics.forPublicKeys = function (done) {
  retrieve({ type: 'pubkeys' }, done);
};

MerkleSchema.statics.signaturesOfAmendment = function (number, hash, done) {
  retrieve({ type: 'amendment', criteria: '{"number":'+number+',"hash": "'+hash+'"}' }, done);
};

MerkleSchema.statics.signaturesWrittenForAmendment = function (number, hash, done) {
  retrieve({ type: 'amendment_signatures', criteria: '{"number":'+number+',"hash": "'+hash+'"}' }, done);
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

MerkleSchema.statics.seenKeys = function (done) {
  retrieve({ type: 'seenKeys', criteria: '{}' }, done);
};

MerkleSchema.statics.managedKeys = function (done) {
  retrieve({ type: 'managedKeys', criteria: '{}' }, done);
};

MerkleSchema.statics.THTEntries = function (done) {
  retrieve({ type: 'thtentries', criteria: '{}' }, done);
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

MerkleSchema.statics.removePublicKey = function (fingerprint, done) {
  async.waterfall([
    function (next) {
      Merkle.forPublicKeys(function (err, merkle) {
        next(err, merkle);
      });
    },
    function (merkle, next) {
      merkle.remove(fingerprint);
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

MerkleSchema.statics.updateForTHTEntries= function (previousHash, newHash, done) {
  async.waterfall([
    function (next) {
      Merkle.THTEntries(function (err, merkle) {
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

MerkleSchema.statics.mapIdentical = function (hashes, done) {
  var map = {};
  hashes.forEach(function (leaf) {
    map[leaf] = leaf;
  });
  done(null, map);
};

MerkleSchema.statics.mapForPublicKeys = function (hashes, done) {
  mongoose.model('PublicKey')
  .find({ fingerprint: { $in: hashes } })
  .sort('fingerprint')
  .exec(function (err, pubkeys) {
    var map = {};
    pubkeys.forEach(function (pubkey){
      map[pubkey.fingerprint] = {
        fingerprint: pubkey.fingerprint,
        pubkey: pubkey.raw,
        signature: pubkey.signature
      };
    });
    done(null, map);
  });
}

MerkleSchema.statics.mapForSignatures = function (hashes, done) {
  mongoose.model('Vote')
  .find({ hash: { $in: hashes } })
  .sort('hash')
  .exec(function (err, votes) {
    var map = {};
    votes.forEach(function (vote){
      map[vote.hash] = {
        issuer: vote.issuer,
        signature: vote.signature
      };
    });
    done(null, map);
  });
};

MerkleSchema.statics.mapForTHTEntries = function (hashes, done) {
  mongoose.model('THTEntry')
  .find({ hash: { $in: hashes } })
  .sort('hash')
  .exec(function (err, entries) {
    var map = {};
    entries.forEach(function (entry){
      map[entry.hash] = entry.json();
    });
    done(null, map);
  });
};

var Merkle = mongoose.model('Merkle', MerkleSchema);
