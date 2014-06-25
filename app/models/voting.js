var mongoose = require('mongoose');
var async    = require('async');
var sha1     = require('sha1');
var jpgp     = require('../lib/jpgp');
var _        = require('underscore');
var rawer    = require('../lib/rawer');
var Schema   = mongoose.Schema;

var VotingSchema = new Schema({
  version: String,
  currency: String,
  issuer: { type: String },
  amNumber: Number,
  eligible: { type: Boolean, default: true },
  current: { type: Boolean, default: false },
  signature: String,
  type: String,
  date: { type: Date },
  propagated: { type: Boolean, default: false },
  hash: String,
  sigDate: { type: Date, default: function(){ return new Date(0); } },
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

VotingSchema.pre('save', function (next) {
  this.updated = Date.now();
  next();
});

VotingSchema.virtual('pubkey').get(function () {
  return this._pubkey;
});

VotingSchema.virtual('pubkey').set(function (am) {
  this._pubkey = am;
});

VotingSchema.virtual('amHash').get(function () {
  return this._amHash;
});

VotingSchema.virtual('amHash').set(function (am) {
  this._amHash = am;
});

VotingSchema.methods = {

  keyID: function () {
    return this.issuer && this.issuer.length > 24 ? "0x" + this.issuer.substring(24) : "0x?";
  },
  
  copyValues: function(to) {
    var obj = this;
    ["version", "currency", "issuer", "hash", "signature", "sigDate"].forEach(function (key) {
      to[key] = obj[key];
    });
  },
  
  json: function() {
    var obj = this;
    var json = {};
    ["version", "currency", "issuer"].forEach(function (key) {
      json[key] = obj[key];
    });
    json.date = this.date.timestamp();
    json.sigDate = this.sigDate.timestamp();
    json.raw = this.getRaw();
    return { signature: this.signature, voting: json };
  },

  verifySignature: function (publicKey, done) {
    jpgp()
      .publicKey(publicKey)
      .data(this.getRaw())
      .signature(this.signature)
      .verify(publicKey, done);
  },

  getRaw: function() {
    return rawer.getVotingWithoutSignature(this);
  },

  getRawSigned: function() {
    return rawer.getVoting(this);
  }
}

VotingSchema.statics.getForAmendmentAndIssuer = function (amNumber, issuer, done) {
  
  this.find({ issuer: issuer, amNumber: amNumber }, done);
}

VotingSchema.statics.getEligibleForAmendment = function (amNumber, done) {
  
  this.find({ eligible: true, amNumber: amNumber }, done);
}

VotingSchema.statics.getCurrent = function (issuer, done) {
  
  this
    .find({ current: true, issuer: issuer })
    .sort({ 'sigDate': -1 })
    .limit(1)
    .exec(function (err, votings) {
      done(null, votings.length == 1 ? votings[0] : null);
  });
}

VotingSchema.statics.getCurrentForIssuerAndAmendment = function (issuer, amendmentNumber, done) {
  
  this
    .find({ current: true, issuer: issuer, amNumber: { $lt: amendmentNumber } })
    .sort({ 'sigDate': -1 })
    .limit(1)
    .exec(function (err, votings) {
      done(null, votings.length == 1 ? votings[0] : null);
  });
}

VotingSchema.statics.getHistory = function (issuer, done) {
  
  this
    .find({ issuer: issuer })
    .sort({ 'sigDate': -1 })
    .exec(done);
}

VotingSchema.statics.removeCurrents = function (issuer, done) {
  
  this
    .update({ issuer: issuer }, { $set: { current: false }}, { multi: true }, function (err) {
      done(err);
    });
}

module.exports = VotingSchema;
