var mongoose = require('mongoose');
var async    = require('async');
var sha1     = require('sha1');
var jpgp     = require('../lib/jpgp');
var _        = require('underscore');
var rawer    = require('../lib/rawer');
var Schema   = mongoose.Schema;

var WalletSchema = new Schema({
  version: String,
  currency: String,
  fingerprint: { type: String, unique: true },
  hosters: [String],
  trusts: [String],
  requiredTrusts: Number,
  signature: String,
  date: { type: Date },
  propagated: { type: Boolean, default: false },
  hash: String,
  sigDate: { type: Date, default: function(){ return new Date(0); } },
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

WalletSchema.pre('save', function (next) {
  this.updated = Date.now();
  next();
});

WalletSchema.methods = {

  keyID: function () {
    return this.fingerprint && this.fingerprint.length > 24 ? "0x" + this.fingerprint.substring(24) : "0x?";
  },
  
  copyValues: function(to) {
    var obj = this;
    ["version", "currency", "fingerprint", "hosters", "trusts", "hash", "signature", "sigDate", "date", "requiredTrusts"].forEach(function (key) {
      to[key] = obj[key];
    });
    to.keyID = obj.keyID().replace('0x', '');
  },
  
  json: function() {
    var obj = this;
    var json = {};
    ["version", "currency", "fingerprint", "hosters", "trusts"].forEach(function (key) {
      json[key] = obj[key];
    });
    return { signature: this.signature, entry: json };
  },

  verifySignature: function (publicKey, done) {
    jpgp()
      .publicKey(publicKey)
      .data(this.getRaw())
      .signature(this.signature)
      .verify(publicKey, done);
  },

  getRaw: function() {
    return rawer.getWalletWithoutSignature(this);
  },

  getRawSigned: function() {
    return rawer.getWallet(this);
  }
}

WalletSchema.statics.getTheOne = function (fingerprint, done) {
  this.find({ fingerprint: fingerprint }, function (err, entries) {
    if(entries && entries.length == 1){
      done(err, entries[0]);
      return;
    }
    if(!entries || entries.length == 0){
      done('No Wallet entry found');
      return;
    }
    if(entries || entries.length > 1){
      done('More than one Wallet entry found');
    }
  });
}

WalletSchema.statics.findMatchingTransaction = function (tx, done) {
  this.find({
    fingerprint: { $in: [tx.sender, tx.recipient ]}
  }, done);
}

module.exports = WalletSchema;
