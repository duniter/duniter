var mongoose = require('mongoose');
var async    = require('async');
var Schema   = mongoose.Schema;

var KeySchema = new Schema({
  fingerprint: String,
  seen: { type: Boolean, default: false },
  managed: { type: Boolean, default: false },
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

KeySchema.statics.setSeenTX = function(tx, seen, done){
  async.waterfall([
    function (next){
      mongoose.model('Key').setSeen(tx.sender, true, next);
    },
    function (next){
      mongoose.model('Key').setSeen(tx.recipient, true, next);
    }
  ], done);
}

KeySchema.statics.setSeen = function(fingerprint, seen, done){
  Key.findOne({ fingerprint: fingerprint }, function (err, key) {
    key = key || new Key({ fingerprint: fingerprint });
    if(key.seen == seen && key._id){
      // Value is the same and already recorded
      done();
      return;
    }
    key.seen = seen;
    async.waterfall([
      function (next){
        key.save(next);
      },
      function (obj, code, next){
        updateMerkle(key, next);
      }
    ], done);
  });
}

KeySchema.statics.setManaged = function(fingerprint, managed, done){
  Key.findOne({ fingerprint: fingerprint }, function (err, key) {
    key = key || new Key({ fingerprint: fingerprint });
    if(key.managed == managed && key._id){
      // Value is the same and already recorded
      done();
      return;
    }
    key.managed = managed;
    async.waterfall([
      function (next){
        key.save(next);
      },
      function (obj, code, next){
        updateMerkle(key, next);
      }
    ], done);
  });
}

function updateMerkle (key, done) {
  async.waterfall([
    function (next){
      mongoose.model('Merkle').keys(next);
    },
    function (merkle, next){
      merkle.push(key.fingerprint);
      merkle.save(function (err) {
        next(err);
      });
    }
  ], function (err, result) {
    done(err);
  });
}

var Key = mongoose.model('Key', KeySchema);
