var mongoose = require('mongoose');
var async    = require('async');
var sha1     = require('sha1');
var jpgp     = require('../lib/jpgp');
var _        = require('underscore');
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
  
  parse: function(rawVotingRequest, callback) {
    var rawMS = rawVotingRequest;
    var sigIndex = rawVotingRequest.lastIndexOf("-----BEGIN");
    if(~sigIndex){
      this.signature = rawVotingRequest.substring(sigIndex);
      rawMS = rawVotingRequest.substring(0, sigIndex);
      try{
        this.sigDate = jpgp().signature(this.signature).signatureDate();
      }
      catch(ex){}
    }
    if(!rawMS){
      callback("No Voting entry given");
      return false;
    }
    else{
      var obj = this;
      var captures = [
        {prop: "version",           regexp: /Version: (.*)/},
        {prop: "currency",          regexp: /Currency: (.*)/},
        {prop: "type",              regexp: /Registry: (.*)/},
        {prop: "issuer",            regexp: /Issuer: (.*)/},
        {prop: "date",              regexp: /Date: (.*)/, parser: parseDateFromTimestamp}
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
    if (!this.date) {
      this.date = new Date();
    }
    this.hash = sha1(rawVotingRequest).toUpperCase();
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
      .signature(this.signature)
      .verify(publicKey, done);
  },

  getRaw: function() {
    var raw = "";
    raw += "Version: " + this.version + "\n";
    raw += "Currency: " + this.currency + "\n";
    raw += "Registry: " + this.type + "\n";
    raw += "Issuer: " + this.issuer + "\n";
    raw += "Date: " + this.date.timestamp() + "\n";
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
    'BAD_ISSUER': 152,
    'BAD_KEY': 153,
    'BAD_REGISTRY_TYPE': 154,
    'BAD_DATE': 155,
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
    // Registry document type
    if(!obj.type || !obj.type.match("^VOTING$"))
      err = {code: codes['BAD_REGISTRY_TYPE'], message: "Incorrect Registry field: must be VOTING"};
  }
  if(!err){
    // Issuer
    if(obj.issuer && !obj.issuer.isSha1())
      err = {code: codes['BAD_ISSUER'], message: "Incorrect issuer field"};
  }
  if(!err){
    // Date
    if(obj.date && (typeof obj == 'string' ? !obj.date.match(/^\d+$/) : obj.date.timestamp() <= 0))
      err = {code: codes['BAD_DATE'], message: "Incorrect Date field: must be a positive or zero integer"};
  }
  if(err){
    return { result: false, errorMessage: err.message, errorCode: err.code};
  }
  return { result: true };
}

function simpleLineExtraction(pr, rawMS, cap) {
  var fieldValue = rawMS.match(cap.regexp);
  if(fieldValue && fieldValue.length === 2){
    pr[cap.prop] = cap.parser ? cap.parser(fieldValue[1]) : fieldValue[1];
  }
  return;
}

function parseDateFromTimestamp (value) {
  return new Date(parseInt(value)*1000);
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
