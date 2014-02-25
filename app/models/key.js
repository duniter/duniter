var mongoose = require('mongoose');
var async    = require('async');
var Schema   = mongoose.Schema;
var logger   = require('../../app/lib/logger')('key model');

var KeySchema = new Schema({
  fingerprint: { type: String, unique: true },
  managed: { type: Boolean, default: false },
  member: { type: Boolean, default: false },
  voter: { type: Boolean, default: false },
  proposedMember: { type: Boolean, default: false },
  proposedVoter: { type: Boolean, default: false },
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

KeySchema.statics.setKnown = function(fingerprint, done){
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
  Key.find({ fingerprint: fingerprint, managed: true }, function (err, keys) {
    if(keys.length > 1){
      done('More than one key managed with fingerprint ' + fingerprint);
      return;
    }
    done(null, keys.length == 1);
  });
}

KeySchema.statics.getMembers = function(done){
  Key.find({ member: true }, done);
};

KeySchema.statics.getVoters = function(done){
  Key.find({ voter: true }, done);
};

KeySchema.statics.getProposedMembers = function(done){
  Key.find({ proposedMember: true }, done);
};

KeySchema.statics.getProposedVoters = function(done){
  Key.find({ proposedVoter: true }, done);
};

KeySchema.statics.addMember = function(fingerprint, done){
  Key.update({ fingerprint: fingerprint }, { member: true }, function (err) {
    done(err);
  });
};

KeySchema.statics.addVoter = function(fingerprint, done){
  Key.update({ fingerprint: fingerprint }, { voter: true }, function (err) {
    done(err);
  });
};

KeySchema.statics.addProposedMember = function(fingerprint, done){
  Key.update({ fingerprint: fingerprint }, { proposedMember: true }, function (err) {
    done(err);
  });
};

KeySchema.statics.addProposedVoter = function(fingerprint, done){
  Key.update({ fingerprint: fingerprint }, { proposedVoter: true }, function (err) {
    done(err);
  });
};

KeySchema.statics.removeMember = function(fingerprint, done){
  Key.update({ fingerprint: fingerprint }, { member: false }, function (err) {
    done(err);
  });
};

KeySchema.statics.removeVoter = function(fingerprint, done){
  Key.update({ fingerprint: fingerprint }, { voter: false }, function (err) {
    done(err);
  });
};

KeySchema.statics.removeProposedMember = function(fingerprint, done){
  Key.update({ fingerprint: fingerprint }, { proposedMember: false }, function (err) {
    done(err);
  });
};

KeySchema.statics.removeProposedVoter = function(fingerprint, done){
  Key.update({ fingerprint: fingerprint }, { proposedVoter: false }, function (err) {
    done(err);
  });
};

var Key = mongoose.model('Key', KeySchema);
