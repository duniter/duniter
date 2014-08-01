var mongoose = require('mongoose');
var async    = require('async');
var sha1     = require('sha1');
var jpgp     = require('../lib/jpgp');
var _        = require('underscore');
var rawer    = require('../lib/rawer');
var Schema   = mongoose.Schema;

var MembershipSchema = new Schema({
  version: String,
  currency: String,
  issuer: { type: String },
  membership: String,
  type: String,
  amNumber: Number,
  eligible: { type: Boolean, default: true },
  current: { type: Boolean, default: false },
  signature: String,
  date: { type: Date },
  propagated: { type: Boolean, default: false },
  hash: String,
  sigDate: { type: Date, default: function(){ return new Date(0); } },
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

MembershipSchema.pre('save', function (next) {
  this.updated = Date.now();
  next();
});

MembershipSchema.virtual('pubkey').get(function () {
  return this._pubkey;
});

MembershipSchema.virtual('pubkey').set(function (am) {
  this._pubkey = am;
});

MembershipSchema.virtual('amHash').get(function () {
  return this._amHash;
});

MembershipSchema.virtual('amHash').set(function (am) {
  this._amHash = am;
});

MembershipSchema.methods = {

  keyID: function () {
    return this.issuer && this.issuer.length > 24 ? "0x" + this.issuer.substring(24) : "0x?";
  },
  
  copyValues: function(to) {
    var obj = this;
    ["version", "currency", "issuer", "membership", "amNumber", "hash", "signature", "sigDate"].forEach(function (key) {
      to[key] = obj[key];
    });
  },
  
  json: function() {
    var obj = this;
    var json = {};
    ["version", "currency", "issuer", "membership"].forEach(function (key) {
      json[key] = obj[key];
    });
    json.date = this.date && this.date.timestamp();
    json.sigDate = this.sigDate && this.sigDate.timestamp();
    json.raw = this.getRaw();
    return { signature: this.signature, membership: json };
  },

  verifySignature: function (publicKey, done) {
    jpgp()
      .publicKey(publicKey)
      .data(this.getRaw())
      .signature(this.signature)
      .verify(publicKey, done);
  },

  getRaw: function() {
    return rawer.getMembershipWithoutSignature(this);
  },

  getRawSigned: function() {
    return rawer.getMembership(this);
  }
}

MembershipSchema.statics.getEligibleForAmendment = function (amNumber, done) {
  
  this.find({ eligible: true, amNumber: amNumber }, done);
}

MembershipSchema.statics.getForAmendmentAndIssuer = function (amNumber, issuer, done) {
  
  this.find({ issuer: issuer, amNumber: amNumber }, done);
}

MembershipSchema.statics.getCurrentInOlderThan = function (exclusiveLimitingDate, done) {
  
  this.find({ current: true, sigDate: { $lt: exclusiveLimitingDate } }, function (err, mss) {
    done(err, mss || []);
  });
}

MembershipSchema.statics.getCurrent = function (issuer, done) {
  
  this
    .find({ current: true, issuer: issuer })
    .sort({ 'sigDate': -1 })
    .limit(1)
    .exec(function (err, mss) {
      done(null, mss.length == 1 ? mss[0] : null);
  });
}

MembershipSchema.statics.getCurrentForIssuerAndAmendment = function (issuer, amendmentNumber, done) {
  
  this
    .find({ current: true, issuer: issuer, amNumber: { $lt: amendmentNumber } })
    .sort({ 'sigDate': -1 })
    .limit(1)
    .exec(function (err, mss) {
      done(null, mss.length == 1 ? mss[0] : null);
  });
}

MembershipSchema.statics.getHistory = function (issuer, done) {
  
  this
    .find({ issuer: issuer })
    .sort({ 'sigDate': -1 })
    .exec(done);
}

MembershipSchema.statics.getForHashAndIssuer = function (hash, issuer, done) {
  
  this
    .find({ issuer: issuer, hash: hash })
    .sort({ 'sigDate': -1 })
    .exec(done);
}

module.exports = MembershipSchema;
