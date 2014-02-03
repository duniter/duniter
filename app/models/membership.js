var mongoose = require('mongoose');
var async    = require('async');
var sha1     = require('sha1');
var jpgp     = require('../lib/jpgp');
var _        = require('underscore');
var Schema   = mongoose.Schema;

var MembershipSchema = new Schema({
  version: String,
  currency: String,
  issuer: { type: String },
  membership: String,
  amNumber: Number,
  eligible: { type: Boolean, default: true },
  current: { type: Boolean, default: false },
  signature: String,
  propagated: { type: Boolean, default: false },
  hash: String,
  sigDate: { type: Date, default: function(){ return new Date(0); } },
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

MembershipSchema.methods = {
  
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
    json.sigDate = this.sigDate && this.sigDate.timestamp();
    json.raw = this.getRaw();
    return { signature: this.signature, entry: json };
  },
  
  parse: function(rawMembershipRequest, callback) {
    var rawMS = rawMembershipRequest;
    var sigIndex = rawMembershipRequest.lastIndexOf("-----BEGIN");
    if(~sigIndex){
      this.signature = rawMembershipRequest.substring(sigIndex);
      rawMS = rawMembershipRequest.substring(0, sigIndex);
      try{
        this.sigDate = jpgp().signature(this.signature).signatureDate();
      }
      catch(ex){}
    }
    if(!rawMS){
      callback("No Membership entry given");
      return false;
    }
    else{
      var obj = this;
      var captures = [
        {prop: "version",           regexp: /Version: (.*)/},
        {prop: "currency",          regexp: /Currency: (.*)/},
        {prop: "issuer",            regexp: /Issuer: (.*)/},
        {prop: "membership",        regexp: /Membership: (.*)/}
      ];
      var crlfCleaned = rawMS.replace(/\r\n/g, "\n");
      if(crlfCleaned.match(/\n$/)){
        captures.forEach(function (cap) {
          simpleLineExtraction(obj, crlfCleaned, cap);
        });
      }
      else{
        callback("Bad document structure: no new line character at the end of the document.");
        return false;
      }
    }
    this.hash = sha1(rawMembershipRequest).toUpperCase();
    callback(null, this);
  },

  verify: function (currency, done) {
    var firstVerif = verify(this, currency);
    var valid = firstVerif.result;
    if(!valid && done){
      done(firstVerif.errorMessage, valid);
    }
    if(valid && done){
      done(null, valid);
    }
    return valid;
  },

  verifySignature: function (publicKey, done) {
    jpgp()
      .publicKey(publicKey)
      .data(this.getRaw())
      .noCarriage()
      .signature(this.signature)
      .verify(publicKey, done);
  },

  getRaw: function() {
    var raw = "";
    raw += "Version: " + this.version + "\n";
    raw += "Currency: " + this.currency + "\n";
    raw += "Issuer: " + this.issuer + "\n";
    raw += "Membership: " + this.membership + "\n";
    return raw.unix2dos();
  },

  getRawSigned: function() {
    var raw = this.getRaw() + this.signature;
    return raw;
  }
}

function verify(obj, currency) {
  var err = null;
  var code = 150;
  var codes = {
    'BAD_VERSION': 150,
    'BAD_CURRENCY': 151,
    'BAD_FINGERPRINT': 152,
    'BAD_MEMBERSHIP': 153,
  }
  if(!err){
    // Version
    if(!obj.version || !obj.version.match(/^1$/))
      err = {code: codes['BAD_VERSION'], message: "Version unknown"};
  }
  if(!err){
    // Currency
    if(!obj.currency || !obj.currency.match("^"+ currency + "$"))
      err = {code: codes['BAD_CURRENCY'], message: "Currency '"+ obj.currency +"' not managed"};
  }
  if(!err){
    // Fingerprint
    if(obj.issuer && !obj.issuer.match(/^[A-Z\d]+$/))
      err = {code: codes['BAD_FINGERPRINT'], message: "Incorrect issuer field"};
  }
  if(!err){
    // Membership
    if(obj.membership && !obj.membership.match(/^(JOIN|ACTUALIZE|LEAVE)$/))
      err = {code: codes['BAD_MEMBERSHIP'], message: "Incorrect Membership field: must be either JOIN, ACTUALIZE or LEAVE"};
  }
  if(err){
    return { result: false, errorMessage: err.message, errorCode: err.code};
  }
  return { result: true };
}

function simpleLineExtraction(pr, rawMS, cap) {
  var fieldValue = rawMS.match(cap.regexp);
  if(fieldValue && fieldValue.length === 2){
    pr[cap.prop] = fieldValue[1];
  }
  return;
}

MembershipSchema.statics.getEligibleForAmendment = function (amNumber, done) {
  
  this.find({ eligible: true, amNumber: amNumber }, done);
}

MembershipSchema.statics.getForAmendmentAndIssuer = function (amNumber, issuer, done) {
  
  this.find({ issuer: issuer, amNumber: amNumber }, done);
}

MembershipSchema.statics.getCurrentJoinOrActuOlderThan = function (exclusiveLimitingDate, done) {
  
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

var Membership = mongoose.model('Membership', MembershipSchema);
