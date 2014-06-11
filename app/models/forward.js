var mongoose = require('mongoose');
var async    = require('async');
var sha1     = require('sha1');
var jpgp     = require('../lib/jpgp');
var _        = require('underscore');
var Schema   = mongoose.Schema;

var ForwardSchema = new Schema({
  version: String,
  currency: String,
  from: String,
  to: String,
  forward: String,
  keys: [String],
  hashBasis: String,
  upstream: { type: Boolean, default: false },
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

ForwardSchema.pre('save', function (next) {
  this.hashBasis = this.getHashBasis();
  this.updated = Date.now();
  next();
});

ForwardSchema.methods = {

  fromKeyID: function () {
    return this.from && this.from.length > 24 ? "0x" + this.from.substring(24) : "0x?";
  },

  toKeyID: function () {
    return this.to && this.to.length > 24 ? "0x" + this.to.substring(24) : "0x?";
  },
  
  copyValues: function(to) {
    var obj = this;
    ["version", "currency", "from", "to", "forward", "keys", "upstream"].forEach(function (key) {
      to[key] = obj[key];
    });
  },
  
  json: function() {
    var obj = this;
    var json = {};
    ["version", "currency", "from", "to", "forward", "keys"].forEach(function (key) {
      json[key] = obj[key];
    });
    return json;
  },
  
  parse: function(rawForwardingReq, callback) {
    var rawPR = rawForwardingReq;
    var sigIndex = rawForwardingReq.lastIndexOf("-----BEGIN");
    if(~sigIndex){
      this.signature = rawForwardingReq.substring(sigIndex);
      rawPR = rawForwardingReq.substring(0, sigIndex);
    }
    if(!rawPR){
      callback("No peering request given");
      return false;
    }
    else{
      var obj = this;
      var captures = [
        {prop: "version",           regexp: /Version: (.*)/},
        {prop: "currency",          regexp: /Currency: (.*)/},
        {prop: "from",              regexp: /From: (.*)/},
        {prop: "to",                regexp: /To: (.*)/},
        {prop: "forward",           regexp: /Forward: (.*)/},
        {prop: "keys",              regexp: /Keys:\n([\s\S]*)/}
      ];
      var crlfCleaned = rawPR.replace(/\r\n/g, "\n");
      if(crlfCleaned.match(/\n$/)){
        captures.forEach(function (cap) {
          if(cap.prop == "keys"){
            extractKeys(obj, crlfCleaned, cap);
          }
          else{
            simpleLineExtraction(obj, crlfCleaned, cap);
          }
        });
      }
      else{
        callback("Bad document structure: no new line character at the end of the document.");
        return false;
      }
    }
    this.hash = sha1(rawForwardingReq).toUpperCase();
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

  getRawBasis: function() {
    var raw = "";
    raw += "Version: " + this.version + "\n";
    raw += "Currency: " + this.currency + "\n";
    raw += "From: " + this.from + "\n";
      raw += "Forward: " + this.forward + "\n";
    if(this.keys.length > 0){
      raw += "Keys:\n";
      for(var i = 0; i < this.keys.length; i++){
        raw += this.keys[i] + "\n";
      }
    }
    return raw.unix2dos();
  },

  getRaw: function() {
    var raw = "";
    raw += "Version: " + this.version + "\n";
    raw += "Currency: " + this.currency + "\n";
    raw += "From: " + this.from + "\n";
    raw += "To: " + this.to + "\n";
      raw += "Forward: " + this.forward + "\n";
    if(this.keys.length > 0){
      raw += "Keys:\n";
      for(var i = 0; i < this.keys.length; i++){
        raw += this.keys[i] + "\n";
      }
    }
    return raw.unix2dos();
  },

  getRawSigned: function() {
    var raw = this.getRaw() + this.signature;
    return raw;
  },

  getHashBasis: function () {
    if (!this.hashBasis)
      this.hashBasis = sha1(this.getRawBasis()).toUpperCase();
    return this.hashBasis;
  }
}

function verify(obj, currency) {
  var err = null;
  var code = 150;
  var codes = {
    'BAD_VERSION': 150,
    'BAD_CURRENCY': 151,
    'BAD_FINGERPRINT': 152,
    'BAD_FORWARD': 156,
    'BAD_KEYS': 157
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
    // From
    if(obj.from && !obj.from.match(/^[A-Z\d]+$/))
      err = {code: codes['BAD_FINGERPRINT'], message: "Incorrect From field"};
  }
  if(!err){
    // To
    if(obj.to && !obj.to.match(/^[A-Z\d]+$/))
      err = {code: codes['BAD_FINGERPRINT'], message: "Incorrect To field"};
  }
  if(!err){
    // Forward
    if(!obj.forward || !obj.forward.match(/^(ALL|KEYS)$/))
      err = {code: codes['BAD_FORWARD'], message: "Forward must be provided and match either ALL or KEYS string"};
  }
  if(err){
    return { result: false, errorMessage: err.message, errorCode: err.code};
  }
  return { result: true };
}

function simpleLineExtraction(pr, rawPR, cap) {
  var fieldValue = rawPR.match(cap.regexp);
  if(fieldValue && fieldValue.length === 2){
    pr[cap.prop] = fieldValue[1];
  }
  return;
}

function extractKeys(pr, rawPR, cap) {
  var fieldValue = rawPR.match(cap.regexp);
  pr[cap.prop] = [];
  if(fieldValue && fieldValue.length == 2){
    var lines = fieldValue[1].split(/\n/);
    if(lines[lines.length - 1].match(/^$/)){
      for (var i = 0; i < lines.length - 1; i++) {
        var line = lines[i];
        var key = line.match(/^([A-Z\d]{40})$/);
        if(key && key.length == 2){
          pr[cap.prop].push(line);
        }
        else{
          return "Wrong structure for line: '" + line + "'";
        }
      }
    }
    else return "Wrong structure for 'Keys' field of the peering request";
  }
  return;
}

ForwardSchema.statics.getTheOne = function (from, to, done) {
  var Forward = this.model('Forward');
  this.findOne({ from: from, to: to }, function (err, fwd) {
    fwd = fwd || new Forward({ from: from, to: to, forward: 'KEYS', keys: [] });
    done(null, fwd);
  });
}

ForwardSchema.statics.removeTheOne = function (from, to, done) {
  this.remove({ from: from, to: to }, function (err) {
    done(err);
  });
}

ForwardSchema.statics.findMatchingTransaction = function (tx, done) {
  this.find({
    $or: [
      { forward: "ALL" },
      { forward: 'KEYS', keys: { $in: [tx.sender, tx.recipient ]} }
    ]
  }, done);
}

ForwardSchema.statics.findDifferingOf = function (fingerprint, hashBasis, done) {
  this.find({ from: fingerprint, hashBasis: { $ne: hashBasis } }, done);
}

module.exports = ForwardSchema;
