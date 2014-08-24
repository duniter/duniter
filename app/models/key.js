var mongoose = require('mongoose');
var async    = require('async');
var _        = require('underscore');
var Schema   = mongoose.Schema;
var logger   = require('../../app/lib/logger')('key model');

var KeySchema = new Schema({
  fingerprint: { type: String, unique: true },
  managed: { type: Boolean, default: false },
  member: { type: Boolean, default: false },
  kick: { type: Boolean, default: false },
  eligible: { type: Boolean, default: false },
  distanced: [String], // Array of distanced keys fingerprints
  certifs: [String], // Array of md5 hashes of packets to integrate
  subkeys: [String], // Array of md5 hashes of packets to integrate
  signatories: [String], // Array of md5 hashes of packets to integrate
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

KeySchema.pre('save', function (next) {
  this.updated = Date.now();
  next();
});

KeySchema.statics.getTheOne = function (fingerprint, done) {
  this.find({ fingerprint: fingerprint }, function (err, keys) {
    if(keys.length < 1){
      done('Key 0x' + fingerprint + ' not found.');
      return;
    }
    var key = keys[0];
    done(null, key);
  });
};

KeySchema.statics.getToBeKicked = function(done){
  var Key = this.model('Key');
  Key.find({ kick: true }, done);
}

KeySchema.statics.isStayingMember = function(keyID, done){
  var Key = this.model('Key');
  Key.find({ fingerprint: new RegExp(keyID + '$'), member: true, kick: false }, function (err, keys) {
    if(keys.length > 1){
      done('More than one key managed with keyID ' + keyID);
      return;
    }
    done(null, keys.length == 1);
  });
}

KeySchema.statics.isMember = function(keyID, done){
  var Key = this.model('Key');
  Key.find({ fingerprint: new RegExp(keyID + '$'), member: true }, function (err, keys) {
    if(keys.length > 1){
      done('More than one key managed with keyID ' + keyID);
      return;
    }
    done(null, keys.length == 1);
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

KeySchema.statics.findMembersWhereSignatory = function(signatory, done){
  var Key = this.model('Key');
  Key.find({ member: true, signatories: new RegExp(signatory.substring(24) + '$') }, done);
};

KeySchema.statics.findMembersWithUpdates = function(done){
  var Key = this.model('Key');
  Key.find({ member: true, $or: [ {signatories: { $not: { $size: 0 }}}, { subkeys: { $not: { $size: 0 }}}] }, done);
};

KeySchema.statics.addMember = function(fingerprint, done){
  var Key = this.model('Key');
  Key.update({ fingerprint: fingerprint }, { member: true }, { multi: true }, function (err) {
    done(err);
  });
};

KeySchema.statics.removeMember = function(fingerprint, done){
  var Key = this.model('Key');
  Key.update({ fingerprint: fingerprint }, { member: false }, { multi: true }, function (err) {
    done(err);
  });
};

KeySchema.statics.setKicked = function(fingerprint, distancedKeys, notEnoughLinks, done){
  var Key = this.model('Key');
  Key.update({ fingerprint: fingerprint }, { kick: (distancedKeys.length > 0 || notEnoughLinks), distanced: distancedKeys }, { multi: true }, function (err) {
    done(err);
  });
};

KeySchema.statics.unsetKicked = function(fingerprint, done){
  var Key = this.model('Key');
  Key.update({ fingerprint: fingerprint }, { kick: false }, { multi: true }, function (err) {
    done(err);
  });
};

KeySchema.statics.undistanceEveryKey = function(done){
  var Key = this.model('Key');
  Key.update({}, { kick: false, distanced: [] }, { multi: true }, function (err) {
    done(err);
  });
};

module.exports = KeySchema;
