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
  time: { type: Date, default: Date.now },
  member: { type: Boolean, default: false },
  hash: { type: String, unique: true },
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

IdentitySchema.pre('save', function (next) {
  this.updated = Date.now();
  next();
});

IdentitySchema.virtual('certs').get(function () {
  return this._certs || [];
});

IdentitySchema.virtual('certs').set(function (newCertifs) {
  this._certs = (newCertifs && newCertifs.length >= 0 && newCertifs) || [newCertifs];
});

IdentitySchema.methods = {

  json: function () {
    var uids = [{
      "uid": this.uid,
      "meta": {
        "timestamp": this.time.timestamp()
      },
      "self": this.sig
    }];
    return {
      "pubkey": this.pubkey,
      "uids": uids
    };
  },

  selfCert: function () {
    return rawer.getSelfIdentity(this);
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

IdentitySchema.statics.search = function (search, done) {
  var obj = this;
  var found = [];
  var searchByUID = {
    byPublicKey: function(callback){
      obj.find({ pubkey: new RegExp(search)}, function (err, keys) {
        found.push(keys);
        callback();
      });
    },
    byUID: function(callback){
      obj.find({ uid: new RegExp(search)}, function (err, keys) {
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
