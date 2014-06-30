var mongoose = require('mongoose');
var async    = require('async');
var sha1     = require('sha1');
var jpgp     = require('../lib/jpgp');
var _        = require('underscore');
var rawer    = require('../lib/rawer');
var Schema   = mongoose.Schema;

var ForwardSchema = new Schema({
  version: String,
  currency: String,
  from: String,
  to: String,
  forward: String,
  keys: [String],
  hash: String,
  hashBasis: String,
  signature: String,
  upstream: { type: Boolean, default: false },
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

ForwardSchema.pre('save', function (next) {
  this.hashBasis = this.getHashBasis();
  this.updated = Date.now();
  next();
});

ForwardSchema.virtual('pubkey').get(function () {
  return this._pubkey;
});

ForwardSchema.virtual('pubkey').set(function (am) {
  this._pubkey = am;
});

ForwardSchema.methods = {

  fromKeyID: function () {
    return this.from && this.from.length > 24 ? "0x" + this.from.substring(24) : "0x?";
  },

  toKeyID: function () {
    return this.to && this.to.length > 24 ? "0x" + this.to.substring(24) : "0x?";
  },
  
  copyValues: function(to) {
    var obj = this;
    ["version", "currency", "from", "to", "forward", "keys", "upstream", "signature"].forEach(function (key) {
      to[key] = obj[key];
    });
  },
  
  json: function() {
    var obj = this;
    var json = {};
    ["version", "currency", "from", "to", "forward", "keys"].forEach(function (key) {
      json[key] = obj[key];
    });
    json.raw = this.getRaw();
    return json;
  },

  verifySignature: function (publicKey, done) {
    jpgp()
      .publicKey(publicKey)
      .data(this.getRaw())
      .signature(this.signature)
      .verify(publicKey, done);
  },

  getRawBasis: function() {
    var raw = "";
    raw += "Version: " + this.version + "\n";
    raw += "Currency: " + this.currency + "\n";
    raw += "From: " + this.from + "\n";
      raw += "Forward: " + this.forward + "\n";
    if(this.keys.length > 0){
      raw += "Keys:\n";
      for(var i = 0; i < this.keys.length; i++){
        raw += this.keys[i] + "\n";
      }
    }
    return raw.unix2dos();
  },

  getRaw: function() {
    return rawer.getForwardWithoutSignature(this);
  },

  getRawSigned: function() {
    return rawer.getForward(this);
  },

  getHashBasis: function () {
    if (!this.hashBasis)
      this.hashBasis = sha1(this.getRawBasis()).toUpperCase();
    return this.hashBasis;
  }
}

ForwardSchema.statics.getTheOne = function (from, to, done) {
  var Forward = this.model('Forward');
  this.findOne({ from: from, to: to }, function (err, fwd) {
    fwd = fwd || new Forward({ from: from, to: to, forward: 'KEYS', keys: [] });
    done(null, fwd);
  });
}

ForwardSchema.statics.removeTheOne = function (from, to, done) {
  this.remove({ from: from, to: to }, function (err) {
    done(err);
  });
}

ForwardSchema.statics.findMatchingTransaction = function (tx, done) {
  this.find({
    $or: [
      { forward: "ALL" },
      { forward: 'KEYS', keys: { $in: [tx.sender, tx.recipient ]} }
    ]
  }, done);
}

ForwardSchema.statics.findDifferingOf = function (fingerprint, hashBasis, done) {
  this.find({ from: fingerprint, hashBasis: { $ne: hashBasis } }, done);
}

module.exports = ForwardSchema;
