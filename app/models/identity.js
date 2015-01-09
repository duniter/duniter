var mongoose  = require('mongoose');
var async     = require('async');
var sha1      = require('sha1');
var _         = require('underscore');
var Schema    = mongoose.Schema;
var unix2dos  = require('../lib/unix2dos');
var parsers   = require('../lib/streams/parsers/doc');
var constants = require('../lib/constants');
var rawer     = require('../lib/rawer');
var logger    = require('../lib/logger')('pubkey');

var IdentitySchema = new Schema({
  uid: String,
  pubkey: String,
  sig: String,
  revoked: { type: Boolean, default: false },
  currentMSN: { type: Number, default: -1 },
  memberships: Array,
  time: { type: Date, default: Date.now },
  member: { type: Boolean, default: false },
  kick: { type: Boolean, default: false },
  wasMember: { type: Boolean, default: false },
  hash: { type: String, unique: true },
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

IdentitySchema.pre('save', function (next) {
  this.updated = Date.now();
  this.written = this.written || this.member; // A member has always be written once
  this.hash = sha1(this.uid + this.time.timestamp() + this.pubkey).toUpperCase();
  next();
});

// Certifications

IdentitySchema.virtual('certs').get(function () {
  return this._certs || [];
});

IdentitySchema.virtual('certs').set(function (newCertifs) {
  this._certs = (newCertifs && newCertifs.length >= 0 && newCertifs) || [newCertifs];
});

// Revocation sigature

IdentitySchema.virtual('revocation').get(function () {
  return this._revocation || '';
});

IdentitySchema.virtual('revocation').set(function (revocation) {
  this._revocation = revocation;
});

// Revocation sigature

IdentitySchema.virtual('written').get(function () {
  return this.wasMember || this.member;
});

IdentitySchema.virtual('written').set(function (written) {
  this.wasMember = written;
});

IdentitySchema.methods = {

  json: function () {
    var others = [];
    this.certs.forEach(function(cert){
      others.push({
        "pubkey": cert.pubkey,
        "meta": {
          "block_number": cert.block_number
        },
        "signature": cert.sig
      });
    });
    var uids = [{
      "uid": this.uid,
      "meta": {
        "timestamp": this.time.timestamp()
      },
      "self": this.sig,
      "others": others
    }];
    return {
      "pubkey": this.pubkey,
      "uids": uids
    };
  },

  inline: function () {
    return [this.pubkey, this.sig, this.time.timestamp(), this.uid].join(':');
  },

  selfCert: function () {
    return rawer.getSelfIdentity(this);
  },

  selfRevocation: function () {
    return rawer.getSelfRevocation(this);
  },

  othersCerts: function () {
    var that = this;
    var certs = [];
    this.certs.forEach(function(cert){
      if (cert.to == that.pubkey) {
        // Signature for this pubkey
        certs.push(cert)
      }
    });
    return certs;
  },

  getTargetHash: function () {
    return sha1(this.uid + this.time.timestamp() + this.pubkey).toUpperCase();
  }
};

IdentitySchema.statics.resetMemberships = function(done){
  var Identity = this.model('Identity');
  Identity.update({}, { memberships: [] }, { multi: true }, function (err) {
    done(err);
  });
};

IdentitySchema.statics.addMember = function(pubkey, hash, done){
  var Identity = this.model('Identity');
  Identity.update({ "hash": hash, "pubkey": pubkey }, { member: true }, function (err) {
    done(err);
  });
};

IdentitySchema.statics.removeMember = function(pubkey, hash, done){
  var Identity = this.model('Identity');
  Identity.update({ "pubkey": pubkey, hash: hash }, { member: false }, function (err) {
    done(err);
  });
};

IdentitySchema.statics.fromInline = function (inline) {
  var Identity = this.model('Identity');
  var sp = inline.split(':');
  return new Identity({
    pubkey: sp[0],
    sig: sp[1],
    time: new Date(parseInt(sp[2])*1000),
    uid: sp[3]
  });
};

IdentitySchema.statics.getTheOne = function (pubkey, hash, done) {
  var Identity = this.model('Identity');
  Identity.find({ "pubkey": pubkey, "hash": hash }, function (err, identities) {
    if(identities.length > 1){
      done('Multiple identities found for pubkey ' + pubkey + ' and hash ' + hash + '.');
      return;
    }
    done(null, identities[0] || null);
  });
};

IdentitySchema.statics.getByHash = function (hash, done) {
  var Identity = this.model('Identity');
  Identity.find({ "hash": hash }, function (err, identities) {
    if(identities.length > 1){
      done('Multiple identities found for hash ' + hash + '.');
      return;
    }
    done(null, identities[0] || null);
  });
};

IdentitySchema.statics.isMember = function(pubkey, done){
  var Identity = this.model('Identity');
  Identity.find({ "pubkey": pubkey, "member": true }, function (err, identities) {
    if(identities.length > 1){
      done('More than one matching pubkey & member for ' + pubkey);
      return;
    }
    done(null, identities.length == 1);
  });
}

IdentitySchema.statics.isMemberOrError = function(pubkey, done){
  var Identity = this.model('Identity');
  Identity.isMember(pubkey, function (err, isMember) {
    done(err || (!isMember && "Not a member"));
  });
}

IdentitySchema.statics.getWritten = function(pubkey, done){
  var Identity = this.model('Identity');
  Identity.find({ "pubkey": pubkey, "wasMember": true }, function (err, identities) {
    if(identities.length > 1){
      done('More than one matching pubkey & member for ' + pubkey);
      return;
    }
    done(null, identities.length == 1 ? identities[0] : null);
  });
}

IdentitySchema.statics.getWrittenByUID = function(uid, done){
  var Identity = this.model('Identity');
  Identity.find({ "uid": uid, "wasMember": true }, function (err, identities) {
    if(identities.length > 1){
      done('More than one matching pubkey & member for ' + uid);
      return;
    }
    done(null, identities.length == 1 ? identities[0] : null);
  });
}

IdentitySchema.statics.getMembers = function(done){
  var Identity = this.model('Identity');
  Identity.find({ member: true }, done);
};

IdentitySchema.statics.getToBeKicked = function(done){
  var Identity = this.model('Identity');
  Identity.find({ kick: true }, done);
};

IdentitySchema.statics.setKicked = function(pubkey, hash, notEnoughLinks, done){
  var Identity = this.model('Identity');
  Identity.update({ "pubkey": pubkey, hash: hash }, { kick: notEnoughLinks }, function (err) {
    done(err);
  });
};

IdentitySchema.statics.kickWithOutdatedMemberships = function(maxNumber, done){
  var Identity = this.model('Identity');
  Identity.update({ "currentMSN": { $lte: maxNumber }, "member": true }, { kick: true }, { multi: true }, function (err) {
    done(err);
  });
};

IdentitySchema.statics.unsetKicked = function(pubkey, hash, done){
  var Identity = this.model('Identity');
  Identity.update({ "pubkey": pubkey, hash: hash }, { kick: false }, function (err) {
    done(err);
  });
};

IdentitySchema.statics.search = function (search, done) {
  var obj = this;
  var found = [];
  var searchByUID = {
    byPublicKey: function(callback){
      obj.find({ revoked: false, pubkey: new RegExp(search)}, function (err, keys) {
        found.push(keys);
        callback();
      });
    },
    byUID: function(callback){
      obj.find({ revoked: false, uid: new RegExp(search.replace('+', '\\+'))}, function (err, keys) {
        found.push(keys);
        callback();
      });
    }
  };
  async.parallel(searchByUID, function(err) {
    var identities = {};
    var foundIds = _(found).flatten();
    async.each(foundIds, function (key, done) {
      identities[key.id] = key;
      done();
    }, function (err) {
      done(err, _(identities).values());
    });
  });
};

module.exports = IdentitySchema;
