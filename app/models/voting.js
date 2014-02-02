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
  votingKey: String,
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

VotingSchema.methods = {
  
  copyValues: function(to) {
    var obj = this;
    ["version", "currency", "issuer", "votingKey", "hash", "signature", "sigDate"].forEach(function (key) {
      to[key] = obj[key];
    });
  },
  
  json: function() {
    var obj = this;
    var json = {};
    ["version", "currency", "issuer", "votingKey", "sigDate"].forEach(function (key) {
      json[key] = obj[key];
    });
    json.raw = this.getRaw();
    return { signature: this.signature, entry: json };
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
        {prop: "issuer",            regexp: /Issuer: (.*)/},
        {prop: "votingKey",         regexp: /VotingKey: (.*)/}
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
      .noCarriage()
      .signature(this.signature)
      .verify(publicKey, done);
  },

  getRaw: function() {
    var raw = "";
    raw += "Version: " + this.version + "\n";
    raw += "Currency: " + this.currency + "\n";
    raw += "Issuer: " + this.issuer + "\n";
    raw += "VotingKey: " + this.votingKey + "\n";
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
    // Issuer
    if(obj.issuer && !obj.issuer.isSha1())
      err = {code: codes['BAD_ISSUER'], message: "Incorrect issuer field"};
  }
  if(!err){
    // Voting Key
    if(obj.votingKey && !obj.votingKey.isSha1())
      err = {code: codes['BAD_KEY'], message: "Incorrect voting key field"};
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

VotingSchema.statics.getForAmendmentAndIssuer = function (amNumber, issuer, done) {
  
  this.find({ issuer: issuer, amNumber: amNumber }, done);
}

VotingSchema.statics.getCurrent = function (done) {
  
  this
    .find({ current: true })
    .sort({ 'sigDate': -1 })
    .limit(1)
    .exec(function (err, mss) {
      done(null, mss.length == 1 ? mss[0] : null);
  });
}

var Voting = mongoose.model('Voting', VotingSchema);
