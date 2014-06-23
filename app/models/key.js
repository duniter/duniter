var mongoose = require('mongoose');
var async    = require('async');
var _        = require('underscore');
var Schema   = mongoose.Schema;
var logger   = require('../../app/lib/logger')('key model');

var KeySchema = new Schema({
  fingerprint: { type: String, unique: true },
  managed: { type: Boolean, default: false },
  asMember: Schema.Types.Mixed,
  asVoter: Schema.Types.Mixed,
  member: { type: Boolean, default: false },
  voter: { type: Boolean, default: false },
  proposedMember: { type: Boolean, default: false },
  proposedVoter: { type: Boolean, default: false },
  lastMemberState: { type: Number, default: 0 },
  lastVotingState: { type: Number, default: 0 },
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

KeySchema.pre('save', function (next) {
  this.updated = Date.now();
  this.asMember = this.asMember || {};
  this.asMember.joins = this.asMember.joins || [];
  this.asMember.leaves = this.asMember.leaves || [];
  this.asVoter = this.asVoter || {};
  this.asVoter.joins = this.asVoter.joins || [];
  this.asVoter.leaves = this.asVoter.leaves || [];
  next();
});

KeySchema.statics.memberJoin = function(amNumber, fingerprint, done){
  var Key = this.model('Key');
  Key.update({ fingerprint: fingerprint }, { $push: { "asMember.joins": amNumber }}, done);
}

KeySchema.statics.memberLeave = function(amNumber, fingerprint, done){
  var Key = this.model('Key');
  Key.update({ fingerprint: fingerprint }, { $push: { "asMember.leaves": amNumber }}, done);
}

KeySchema.statics.wasMember = function(fingerprint, amNumber, done){
  var Key = this.model('Key');
  Key.find({ fingerprint: fingerprint }, function (err, keys) {
    if (err || !keys || keys.length == 0) {
      done("Unknown key!");
    } else {
      var k = keys[0];
      var previousJoins = _(k.asMember.joins).filter(function(n) { return n <= amNumber; });
      if (previousJoins.length > 0) {
        var max = _(previousJoins).max();
        var previousLeaves = _(k.asMember.leaves).filter(function(n) { return n <= amNumber; });
        if (previousLeaves.length == 0 || _(previousLeaves).max() < max) {
          // Last operation at amNumber was joining
          done(null, true);
        } else {
          // Last operation at amNumber was leaving
          done(null, false);
        }
      } else {
        // Has not joined yet
        done(null, false);
      }
    }
  });
}

KeySchema.statics.getMembersOn = function(amNumber, done){
  var Key = this.model('Key');
  Key.find({ "asMember.joins": { $lte: amNumber }, $where: memberHasNotLeftSince }, done);
}

KeySchema.statics.getVotersOn = function(amNumber, done){
  var Key = this.model('Key');
  Key.find({ "asVoter.joins": { $lte: amNumber }, $where: voterHasNotLeftSince }, done);
}

function memberHasNotLeftSince() {
  return this.asMember.leaves.length == 0 || _(this.asMember.leaves).max() < _(this.asMember.joins).max();
}

function voterHasNotLeftSince() {
  return this.asVoter.leaves.length == 0 || _(this.asVoter.leaves).max() < _(this.asVoter.joins).max();
}

KeySchema.statics.voterJoin = function(amNumber, fingerprint, done){
  var Key = this.model('Key');
  Key.update({ fingerprint: fingerprint }, { $push: { "asVoter.joins": amNumber }}, done);
}

KeySchema.statics.voterLeave = function(amNumber, fingerprint, done){
  var Key = this.model('Key');
  Key.update({ fingerprint: fingerprint }, { $push: { "asVoter.leaves": amNumber }}, done);
}

KeySchema.statics.wasVoter = function(fingerprint, amNumber, done){
  var Key = this.model('Key');
  Key.find({ fingerprint: fingerprint }, function (err, keys) {
    if (err || !keys || keys.length == 0) {
      done("Unknown key!");
    } else {
      var k = keys[0];
      var previousJoins = _(k.asVoter.joins).filter(function(n) { return n <= amNumber; });
      if (previousJoins.length > 0) {
        var max = _(previousJoins).max();
        var previousLeaves = _(k.asVoter.leaves).filter(function(n) { return n <= amNumber; });
        if (previousLeaves.length == 0 || _(previousLeaves).max() < max) {
          // Last operation at amNumber was joining
          done(null, true);
        } else {
          // Last operation at amNumber was leaving
          done(null, false);
        }
      } else {
        // Has not joined yet
        done(null, false);
      }
    }
  });
}

KeySchema.statics.setKnown = function(fingerprint, done){
  var Key = this.model('Key');
  Key.findOne({ fingerprint: fingerprint }, function (err, key) {
    var newKey = key == null;
    key = key || new Key({ fingerprint: fingerprint });
    if(!newKey){
      // Already recorded
      done();
      return;
    }
    key.save(function (err, obj, code) {
      done(err);
    });
  });
}

KeySchema.statics.setManaged = function(fingerprint, managed, done){
  var Key = this.model('Key');
  Key.findOne({ fingerprint: fingerprint }, function (err, key) {
    key = key || new Key({ fingerprint: fingerprint });
    if(key.managed == managed && key._id){
      // Value is the same and already recorded
      done();
      return;
    }
    key.managed = managed;
    if (managed) {
      logger.debug("Added key %s to managed keys", fingerprint);
    } else {
      logger.debug("Removed key %s from managed keys", fingerprint);
    }
    key.save(function (err) {
      done(err);
    });
  });
}

KeySchema.statics.isManaged = function(fingerprint, done){
  var Key = this.model('Key');
  Key.find({ fingerprint: fingerprint, managed: true }, function (err, keys) {
    if(keys.length > 1){
      done('More than one key managed with fingerprint ' + fingerprint);
      return;
    }
    done(null, keys.length == 1);
  });
}

KeySchema.statics.getManaged = function(done){
  var Key = this.model('Key');
  Key.find({ managed: true }, done);
};

KeySchema.statics.getMembers = function(done){
  var Key = this.model('Key');
  Key.find({ member: true }, done);
};

KeySchema.statics.getVoters = function(done){
  var Key = this.model('Key');
  Key.find({ voter: true }, done);
};

KeySchema.statics.getProposedMembers = function(done){
  var Key = this.model('Key');
  Key.find({ proposedMember: true }, done);
};

KeySchema.statics.getProposedVoters = function(done){
  var Key = this.model('Key');
  Key.find({ proposedVoter: true }, done);
};

KeySchema.statics.addMember = function(fingerprint, done){
  var Key = this.model('Key');
  Key.update({ fingerprint: fingerprint }, { member: true }, function (err) {
    done(err);
  });
};

KeySchema.statics.addVoter = function(fingerprint, done){
  var Key = this.model('Key');
  Key.update({ fingerprint: fingerprint }, { voter: true }, function (err) {
    done(err);
  });
};

KeySchema.statics.addProposedMember = function(fingerprint, done){
  var Key = this.model('Key');
  Key.update({ fingerprint: fingerprint }, { proposedMember: true }, function (err) {
    done(err);
  });
};

KeySchema.statics.addProposedVoter = function(fingerprint, done){
  var Key = this.model('Key');
  Key.update({ fingerprint: fingerprint }, { proposedVoter: true }, function (err) {
    done(err);
  });
};

KeySchema.statics.removeMember = function(fingerprint, done){
  var Key = this.model('Key');
  Key.update({ fingerprint: fingerprint }, { member: false }, function (err) {
    done(err);
  });
};

KeySchema.statics.removeVoter = function(fingerprint, done){
  var Key = this.model('Key');
  Key.update({ fingerprint: fingerprint }, { voter: false }, function (err) {
    done(err);
  });
};

KeySchema.statics.removeProposedMember = function(fingerprint, done){
  var Key = this.model('Key');
  Key.update({ fingerprint: fingerprint }, { proposedMember: false }, function (err) {
    done(err);
  });
};

KeySchema.statics.removeProposedVoter = function(fingerprint, done){
  var Key = this.model('Key');
  Key.update({ fingerprint: fingerprint }, { proposedVoter: false }, function (err) {
    done(err);
  });
};

KeySchema.statics.getLastState = function(key, done){
  var Key = this.model('Key');
  Key.find({ fingerprint: key }, function (err, keys) {
    done(err, (err || keys.length == 0) ? 0 : keys[0].lastVotingState);
  });
};

KeySchema.statics.getLastMSState = function(key, done){
  var Key = this.model('Key');
  Key.find({ fingerprint: key }, function (err, keys) {
    done(err, (err || keys.length == 0) ? 0 : keys[0].lastMemberState);
  });
};

KeySchema.statics.setLastState = function(key, state, done){
  var Key = this.model('Key');
  Key.update({ fingerprint: key }, { $set: { lastVotingState: state }}, function (err) {
    done(err);
  });
};

KeySchema.statics.setLastMSState = function(key, state, done){
  var Key = this.model('Key');
  Key.update({ fingerprint: key }, { $set: { lastMemberState: state }}, function (err) {
    done(err);
  });
};

module.exports = KeySchema;
