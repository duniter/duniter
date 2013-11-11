var mongoose = require('mongoose');
var async    = require('async');
var sha1     = require('sha1');
var jpgp     = require('../lib/jpgp');
var _        = require('underscore');
var Schema   = mongoose.Schema;

var THTEntrySchema = new Schema({
  version: String,
  currency: String,
  fingerprint: { type: String, unique: true },
  hosters: [String],
  trusts: [String],
  signature: String,
  propagated: { type: Boolean, default: false },
  hash: String,
  sigDate: { type: Date, default: function(){ return new Date(0); } },
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

THTEntrySchema.methods = {
  
  copyValues: function(to) {
    var obj = this;
    ["version", "currency", "fingerprint", "hosters", "trusts", "hash", "signature"].forEach(function (key) {
      to[key] = obj[key];
    });
  },
  
  json: function() {
    var obj = this;
    var json = {};
    ["version", "currency", "fingerprint", "hosters", "trusts"].forEach(function (key) {
      json[key] = obj[key];
    });
    return { signature: this.signature, entry: json };
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
      callback("No THT entry given");
      return false;
    }
    else{
      var obj = this;
      var captures = [
        {prop: "version",           regexp: /Version: (.*)/},
        {prop: "currency",          regexp: /Currency: (.*)/},
        {prop: "fingerprint",       regexp: /Key: (.*)/},
        {prop: "hosters",           regexp: /Hosters:\n([\s\S]*)Trusts/},
        {prop: "trusts",            regexp: /Trusts:\n([\s\S]*)/}
      ];
      var crlfCleaned = rawEntry.replace(/\r\n/g, "\n");
      if(crlfCleaned.match(/\n$/)){
        captures.forEach(function (cap) {
          if(cap.prop != "hosters" && cap.prop != "trusts")
            simpleLineExtraction(obj, crlfCleaned, cap);
          else{
            this.error = multipleLinesExtraction(obj, crlfCleaned, cap);
            if(this.error)
              return false;
          }
        });
      }
      else{
        callback("Bad document structure: no new line character at the end of the document.");
        return false;
      }
    }
    this.hash = sha1(rawEntryReq).toUpperCase();
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
    raw += "Key: " + this.fingerprint + "\n";
    raw += "Hosters:\n";
    this.hosters.forEach(function (fingerprint) {
      raw += fingerprint + "\n";
    });
    raw += "Trusts:\n";
    this.trusts.forEach(function (fingerprint) {
      raw += fingerprint + "\n";
    });
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
    if(obj.fingerprint && !obj.fingerprint.match(/^[A-Z\d]+$/))
      err = {code: codes['BAD_FINGERPRINT'], message: "Incorrect fingerprint field"};
  }
  if(err){
    return { result: false, errorMessage: err.message, errorCode: err.code};
  }
  return { result: true };
}

function simpleLineExtraction(pr, rawEntry, cap) {
  var fieldValue = rawEntry.match(cap.regexp);
  if(fieldValue && fieldValue.length === 2){
    pr[cap.prop] = fieldValue[1];
  }
  return;
}

function multipleLinesExtraction(entry, rawEntry, cap) {
  var fieldValue = rawEntry.match(cap.regexp);
  entry[cap.prop] = [];
  if(fieldValue && fieldValue.length == 2){
    var lines = fieldValue[1].split(/\n/);
    if(lines[lines.length - 1].match(/^$/)){
      for (var i = 0; i < lines.length - 1; i++) {
        var line = lines[i];
        var fpr = line.match(/^([A-Z\d]{40})$/);
        if(fpr && fpr.length == 2){
          entry[cap.prop].push(fpr[1]);
        }
        else{
          return "Wrong structure for line: '" + line + "'";
        }
      }
    }
    else return "Wrong structure for line: '" + line + "'";
  }
  return;
}

THTEntrySchema.statics.getTheOne = function (fingerprint, done) {
  this.find({ fingerprint: fingerprint }, function (err, entries) {
    if(entries && entries.length == 1){
      done(err, entries[0]);
      return;
    }
    if(!entries || entries.length == 0){
      done('No THT entry found');
      return;
    }
    if(entries || entries.length > 1){
      done('More than one THT entry found');
    }
  });
}

THTEntrySchema.statics.findMatchingTransaction = function (tx, done) {
  THTEntry.find({
    fingerprint: { $in: [tx.sender, tx.recipient ]}
  }, done);
}

var THTEntry = mongoose.model('THTEntry', THTEntrySchema);
