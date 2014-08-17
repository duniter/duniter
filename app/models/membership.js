var mongoose = require('mongoose');
var async    = require('async');
var sha1     = require('sha1');
var jpgp     = require('../lib/jpgp');
var _        = require('underscore');
var rawer    = require('../lib/rawer');
var dos2unix = require('../lib/dos2unix');
var Schema   = mongoose.Schema;

var MembershipSchema = new Schema({
  version: String,
  currency: String,
  issuer: { type: String },
  membership: String,
  type: String,
  userid: String,
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
  
  inlineValue: function() {
    return [this.version, this.issuer, this.membership, this.date.timestamp(), this.userid].join(':');
  },
  
  inlineSignature: function() {
    var splits = dos2unix(this.signature).split('\n');
    var signature = "";
    var keep = false;
    splits.forEach(function(line){
      if (keep && !line.match('-----END PGP') && line != '') signature += line + '\n';
      if (line == "") keep = true;
    });
    return signature;
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

MembershipSchema.statics.fromInline = function (inlineMS, inlineSig) {
  var Membership = this.model('Membership');
  var splitted = inlineMS.split(':');
  var signature = '-----BEGIN PGP SIGNATURE-----\nVersion: GnuPG v1\n\n';
  signature += inlineSig;
  signature += '-----END PGP SIGNATURE-----\n';
  return new Membership({
    version:    splitted[0],
    issuer:     splitted[1],
    membership: splitted[2],
    date:       splitted[3] ?  new Date(parseInt(splitted[3])*1000) : 0,
    userid:     splitted[4],
    signature:  signature
  });
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

MembershipSchema.statics.removeEligible = function (issuer, done) {
  
  this
    .find({ issuer: issuer, eligible: true })
    .remove(done);
}

module.exports = MembershipSchema;
