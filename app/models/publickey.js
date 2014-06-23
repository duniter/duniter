var jpgp     = require('../lib/jpgp');
var mongoose = require('mongoose');
var async    = require('async');
var sha1     = require('sha1');
var _        = require('underscore');
var Schema   = mongoose.Schema;
var parsers  = require('../lib/streams/parsers/doc');
var logger   = require('../lib/logger')('pubkey');

var PublicKeySchema = new Schema({
  raw: String,
  fingerprint: { type: String, unique: true },
  subkeys: [String], // Array of keyId
  hashes: [String], // Array of ASCII armor representation fingerprints
  name: String,
  email: String,
  comment: String,
  hash: String,
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

PublicKeySchema.pre('save', function (next) {
  this.updated = Date.now();
  if (this.hashes.indexOf(this.hash) == -1) {
    // Remembering incoming hash
    this.hashes.push(this.hash);
  }
  next();
});

PublicKeySchema.virtual('nbVerifiedSigs').get(function () {
  return this._nbVerifiedSigs;
});

PublicKeySchema.virtual('nbVerifiedSigs').set(function (nbVerifiedSigs) {
  this._nbVerifiedSigs = nbVerifiedSigs;
});

PublicKeySchema.virtual('udid2').get(function () {
  return this._udid2;
});

PublicKeySchema.virtual('udid2').set(function (udid2) {
  this._udid2 = udid2;
});

PublicKeySchema.virtual('udid2s').get(function () {
  return this._udid2s;
});

PublicKeySchema.virtual('udid2s').set(function (udid2s) {
  this._udid2s = udid2s;
});

PublicKeySchema.virtual('udid2sigs').get(function () {
  return this._udid2sigs || [];
});

PublicKeySchema.virtual('udid2sigs').set(function (sigs) {
  this._udid2sigs = (sigs && sigs.length) || [sigs];
});

PublicKeySchema.methods = {

  json: function () {
    return {
      "email": this.email,
      "name": this.name,
      "hash": this.hash,
      "fingerprint": this.fingerprint,
      "comment": this.comment,
      "raw": this.raw
    };
  },

  getRaw: function () {
    return this.raw;
  }
};

PublicKeySchema.statics.getTheOne = function (keyID, done) {
  this.search("0x" + keyID, function (err, keys) {
    if(keys.length > 1){
      done('Multiple PGP keys found for keyID 0x' + keyID + '.');
      return;
    }
    if(keys.length < 1){
      done('Corresponding Public Key (0x' + keyID + ') not found.');
      return;
    }
    var pubkey = keys[0];
    done(null, pubkey);
  });
};

PublicKeySchema.statics.getFromSignature = function (asciiArmoredsig, done) {
  var keyID = jpgp().signature(asciiArmoredsig).issuer();
  if(!(keyID && keyID.length == 16)){
    done('Cannot identify signature issuer`s keyID: ' + keyID);
    return;
  }
  this.getTheOne(keyID, done);
};

PublicKeySchema.statics.search = function (motif, done) {
  var obj = this;
  var found = [];
  var fprPattern = motif.match(/^0x(.*)$/);
  var searchByUID = {
    byName: function(callback){
      obj.find({ name: new RegExp(motif, 'i')}, function (err, keys) {
        found.push(keys);
        callback();
      });
    },
    byEmail: function(callback){
      obj.find({ email: new RegExp(motif, 'i')}, function (err, keys) {
        found.push(keys);
        callback();
      });
    },
    byComment: function(callback){
      obj.find({ comment: new RegExp(motif, 'i')}, function (err, keys) {
        found.push(keys);
        callback();
      });
    }
  };
  var searchByFingerprint = {
    byFingerprint: function (callback) {
      var fpr = fprPattern ? fprPattern[1] : "";
      obj.find({ fingerprint: new RegExp(fpr + "$", 'i')}, function (err, keys) {
        found.push(keys);
        callback();
      });
    },
    bySubkey: function (callback) {
      var fpr = fprPattern ? fprPattern[1] : "";
      obj.find({ subkeys: new RegExp(fpr + "$", 'i')}, function (err, keys) {
        found.push(keys);
        callback();
      });
    }
  };
  var searchFunc = fprPattern ? searchByFingerprint : searchByUID;
  async.parallel(searchFunc, function(err) {
    var pubKeys = {};
    var foundKeys = _(found).flatten();
    async.each(foundKeys, function (key, done) {
      pubKeys[key.id] = key;
      done();
    }, function (err) {
      done(err, _(pubKeys).values());
    });
  });
};

PublicKeySchema.statics.persistFromRaw = function (rawPubkey, done) {
  var that = this;
  async.waterfall([
    function (next){
      parsers.parsePubkey(next).asyncWrite(rawPubkey, next);
    },
    function (obj, next){
      var PublicKey = that.model('PublicKey');
      var pubkey = new PublicKey(obj);
      PublicKey.persist(pubkey, next);
    }
  ], done);
}

// Persistance lock to avoid duplicates
var persistQueue = async.queue(function (fingerprint, persistTask) {
  // logger.debug('Persisting pubkey %s', fingerprint);
  persistTask();
}, 1);

PublicKeySchema.statics.persist = function (pubkey, done) {
  var that = this;
  var PublicKey = that.model('PublicKey');
  async.waterfall([
    function (next) {
      persistQueue.push(pubkey.fingerprint, function(){
        var now = new Date();
        var comingKey = jpgp().certificate(pubkey.raw).key;
        that.find({ fingerprint: pubkey.fingerprint }, function (err, foundKeys) {
          var comingArmored = comingKey.armor();
          var comingHash = comingArmored.hash();
          // Create if not exists
          if (foundKeys.length == 0) {
            foundKeys.push(new PublicKey({
              raw: comingArmored,
              fingerprint: pubkey.fingerprint,
              created: now,
              hashes: []
            }));
          }
          // If already treated this ASCII armored value
          if (~foundKeys[0].hashes.indexOf(comingHash)) {
            next('Key already up-to-date');
            return;
          } else {
            // Remembering incoming hash
            foundKeys[0].hashes.push(comingHash);
          }
          var storedKey = jpgp().certificate(foundKeys[0].raw).key;
          // Merges packets
          storedKey.update(comingKey);
          var mergedCert = jpgp().certificate(storedKey.armor());
          foundKeys[0].subkeys = mergedCert.subkeys;
          foundKeys[0].raw = storedKey.armor();
          foundKeys[0].email = pubkey.email;
          foundKeys[0].name = pubkey.name;
          foundKeys[0].comment = pubkey.comment;
          foundKeys[0].hash = storedKey.armor().hash();
          foundKeys[0].save(function (err) {
            next(err);
          });
        });
      });
    }
  ], done);
};

module.exports = PublicKeySchema;
