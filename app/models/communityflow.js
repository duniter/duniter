var mongoose = require('mongoose');
var async    = require('async');
var sha1     = require('sha1');
var jpgp     = require('../lib/jpgp');
var _        = require('underscore');
var Schema   = mongoose.Schema;

var CommunityFlowSchema = new Schema({
  version: String,
  currency: String,
  issuer: { type: String },
  date: { type: Date },
  amendmentNumber: Number,
  amendmentHash: String,
  algorithm: String,
  membersJoiningCount: Number,
  membersJoiningRoot: String,
  membersLeavingCount: Number,
  membersLeavingRoot: String,
  votersJoiningCount: Number,
  votersJoiningRoot: String,
  votersLeavingCount: Number,
  votersLeavingRoot: String,
  signature: String,
  propagated: { type: Boolean, default: false },
  selfGenerated: { type: Boolean, default: false },
  hash: String,
  sigDate: { type: Date, default: function(){ return new Date(0); } },
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

CommunityFlowSchema.pre('save', function (next) {
  this.updated = Date.now();
  next();
});

CommunityFlowSchema.methods = {

  keyID: function () {
    return this.issuer && this.issuer.length > 24 ? "0x" + this.issuer.substring(24) : "0x?";
  },
  
  json: function() {
    var that = this;
    var json = { raw: this.getRaw() };
    [
      "version",
      "amendmentNumber",
      "membersJoiningCount",
      "membersLeavingCount",
      "votersJoiningCount",
      "votersLeavingCount",
    ].forEach(function(field){
      json[field] = parseInt(that[field], 10);
    });
    [
      "currency",
      "amendmentHash",
      "algorithm",
      "membersJoiningRoot",
      "membersLeavingRoot",
      "votersJoiningRoot",
      "votersLeavingRoot",
      "issuer",
    ].forEach(function(field){
      json[field] = that[field] || "";
    });
    json.date = this.date && this.date.timestamp();
    return json;
  },
  
  parse: function(rawEntryReq, callback) {
    var rawEntry = rawEntryReq;
    var sigIndex = rawEntryReq.lastIndexOf("-----BEGIN");
    if(~sigIndex){
      this.signature = rawEntryReq.substring(sigIndex);
      rawEntry = rawEntryReq.substring(0, sigIndex);
      try{
        this.sigDate = jpgp().signature(this.signature).signatureDate();
      }
      catch(ex){}
    }
    if(!rawEntry){
      callback("No CommunityFlow entry given");
      return false;
    }
    else{
      var obj = this;
      var captures = [
        {prop: "version",             regexp: /Version: (.*)/},
        {prop: "currency",            regexp: /Currency: (.*)/},
        {prop: "amendmentNumber",     regexp: /Amendment: (.*)/, parser: parseAmendmentNumber},
        {prop: "amendmentHash",       regexp: /Amendment: (.*)/, parser: parseAmendmentHash},
        {prop: "algorithm",           regexp: /Algorithm: (.*)/},
        {prop: "membersJoiningCount", regexp: /MembersJoining: (.*)/, parser: parseMerkleNumber},
        {prop: "membersJoiningRoot",  regexp: /MembersJoining: (.*)/, parser: parseMerkleRoot},
        {prop: "membersLeavingCount", regexp: /MembersLeaving: (.*)/, parser: parseMerkleNumber},
        {prop: "membersLeavingRoot",  regexp: /MembersLeaving: (.*)/, parser: parseMerkleRoot},
        {prop: "votersJoiningCount",  regexp: /VotersJoining: (.*)/, parser: parseMerkleNumber},
        {prop: "votersJoiningRoot",   regexp: /VotersJoining: (.*)/, parser: parseMerkleRoot},
        {prop: "votersLeavingCount",  regexp: /VotersLeaving: (.*)/, parser: parseMerkleNumber},
        {prop: "votersLeavingRoot",   regexp: /VotersLeaving: (.*)/, parser: parseMerkleRoot},
        {prop: "issuer",              regexp: /Issuer: (.*)/},
        {prop: "date",                regexp: /Date: (.*)/, parser: parseDateFromTimestamp}
      ];
      var crlfCleaned = rawEntry.replace(/\r\n/g, "\n");
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
    this.hash = sha1(rawEntry).toUpperCase();
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
    raw += "Amendment: " + [this.amendmentNumber, this.amendmentHash].join('-') + "\n";
    raw += "Issuer: " + this.issuer + "\n";
    raw += "Date: " + this.date.timestamp() + "\n";
    raw += "Algorithm: " + this.algorithm + "\n";
    if (this.membersJoiningRoot)
      raw += "MembersJoining: " + [this.membersJoiningCount, this.membersJoiningRoot].join('-') + "\n";
    if (this.membersLeavingRoot)
      raw += "MembersLeaving: " + [this.membersLeavingCount, this.membersLeavingRoot].join('-') + "\n";
    if (this.votersJoiningRoot)
      raw += "VotersJoining: " + [this.votersJoiningCount, this.votersJoiningRoot].join('-') + "\n";
    if (this.votersLeavingRoot)
      raw += "VotersLeaving: " + [this.votersLeavingCount, this.votersLeavingRoot].join('-') + "\n";
    return raw.unix2dos();
  },

  getRawSigned: function() {
    var raw = this.getRaw() + this.signature;
    return raw;
  }
}

function parseDateFromTimestamp (value) {
  if (value && value.match(/^\d+$/))
    return new Date(parseInt(value)*1000);
  else
    return new Date();
}

function parseAmendmentNumber (value) {
  var m = value.match(/^(\d+)-([A-Z\d]+)$/);
  if (m)
    return m[1];
  else
    return 0;
}

function parseAmendmentHash (value) {
  var m = value.match(/^(\d+)-([A-Z\d]+)$/);
  if (m)
    return m[2];
  else
    return "";
}

var parseMerkleNumber = parseAmendmentNumber;
var parseMerkleRoot = parseAmendmentHash;

function verify(obj, currency) {
  var err = null;
  var code = 150;
  var codes = {
    'BAD_VERSION': 150,
    'BAD_CURRENCY': 151,
    'BAD_FINGERPRINT': 152,
    'BAD_THRESHOLD': 153,
    'BAD_AM_NUMBER': 154,
    'BAD_AM_HASH': 155,
    'BAD_MERKLE_SUMMARY': 156,
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
    // Date
    if(obj.date && (typeof obj == 'string' ? !obj.date.match(/^\d+$/) : obj.date.timestamp() <= 0))
      err = {code: codes['BAD_DATE'], message: "Incorrect Date field: must be a positive or zero integer"};
  }
  if(!err){
    // Amendment
    if(!err && !obj.amendmentHash.match(/^[A-Z\d]+$/))
      err = {code: codes['BAD_FIELD'], message: "Incorrect amendment field: must be contain an amendment"};
  }
  ['membersJoiningRoot', 'membersLeavingRoot', 'votersJoiningRoot', 'votersLeavingRoot'].forEach(function(field){
    if(!err && !obj[field].match(/^[A-Z\d]+$/))
      err = {code: codes['BAD_MERKLE_SUMMARY'], message: "Incorrect " + field + " field: must be a SHA-1 uppercased hash"};
  });
  if(err){
    return { result: false, errorMessage: err.message, errorCode: err.code};
  }
  return { result: true };
}

function simpleLineExtraction(pr, rawEntry, cap, parser) {
  var fieldValue = rawEntry.match(cap.regexp);
  if(fieldValue && fieldValue.length === 2){
    pr[cap.prop] = cap.parser ? cap.parser(fieldValue[1]) : fieldValue[1];
  }
  return;
}

CommunityFlowSchema.statics.getTheOne = function (amNumber, issuer, algo, done) {
  this.find({ amendmentNumber: amNumber, issuer: issuer, algorithm: algo }, function (err, entries) {
    if(entries && entries.length == 1){
      done(err, entries[0]);
      return;
    }
    if(!entries || entries.length == 0){
      done('No CommunityFlow entry found');
      return;
    }
    if(entries || entries.length > 1){
      done('More than one CommunityFlow entry found');
    }
  });
}

CommunityFlowSchema.statics.getSelf = function (amNumber, algo, done) {
  this.find({ amendmentNumber: amNumber, algorithm: algo, selfGenerated: true }, function (err, entries) {
    if(entries && entries.length == 1){
      done(err, entries[0]);
      return;
    }
    if(!entries || entries.length == 0){
      done('No CommunityFlow entry found');
      return;
    }
    if(entries || entries.length > 1){
      done('More than one CommunityFlow entry found');
    }
  });
}

CommunityFlowSchema.statics.getForAmendmentAndAlgo = function (amNumber, algo, done) {
  this.find({ amendmentNumber: amNumber, algorithm: algo }, done);
}

var CommunityFlow = mongoose.model('CommunityFlow', CommunityFlowSchema);
