var mongoose = require('mongoose');
var async    = require('async');
var sha1     = require('sha1');
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
  current: { type: Boolean, default: false },
  signature: String,
  certts: { type: Date },
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
  
  inline: function() {
    return [this.issuer, this.signature, this.date.timestamp(), this.certts.timestamp(), this.userid].join(':');
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

  getRaw: function() {
    return rawer.getMembershipWithoutSignature(this);
  },

  getRawSigned: function() {
    return rawer.getMembership(this);
  },

  deleteIfExists: function(done) {
    this.model('Membership').remove({
      "issuer": this.issuer,
      "membership": this.membership,
      "userid": this.userid,
      "certts": this.certts,
      "date": this.date
    }, function (err) {
      done(err);
    });
  }
}

MembershipSchema.statics.fromInline = function (inlineMS, type) {
  var Membership = this.model('Membership');
  var sp = inlineMS.split(':');
  return new Membership({
    version:    1,
    issuer:     sp[0],
    membership: type,
    type:       type,
    date:       new Date(parseInt(sp[2])*1000),
    userid:     '',
    signature:  sp[1]
  });
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

MembershipSchema.statics.removeFor = function (issuer, done) {
  
  this
    .find({ issuer: issuer })
    .remove(function (err) {
      done(err);
    });
}

module.exports = MembershipSchema;
