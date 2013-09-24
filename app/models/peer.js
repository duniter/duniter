var mongoose = require('mongoose');
var async    = require('async');
var sha1     = require('sha1');
var jpgp     = require('../lib/jpgp');
var _        = require('underscore');
var Schema   = mongoose.Schema;

var PeerSchema = new Schema({
  version: String,
  currency: String,
  fingerprint: String,
  dns: String,
  ipv4: String,
  ipv6: String,
  port: { type: Number, default: 8081 },
  signature: String,
  hash: String,
  status: String,
  sigDate: { type: Date, default: function(){ return new Date(0); } },
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

PeerSchema.methods = {
  
  copyValues: function(to) {
    var obj = this;
    ["version", "currency", "fingerprint", "dns", "ipv4", "ipv6", "port", "hash", "status", "signature"].forEach(function (key) {
      to[key] = obj[key];
    });
  },
  
  copyValuesFrom: function(from) {
    var obj = this;
    ["version", "currency", "fingerprint", "dns", "ipv4", "ipv6", "port", "signature"].forEach(function (key) {
      obj[key] = from[key];
    });
  },
  
  json: function() {
    var obj = this;
    var json = {};
    ["version", "currency", "fingerprint", "dns", "ipv4", "ipv6", "port", "status", "signature"].forEach(function (key) {
      json[key] = obj[key];
    });
    return json;
  },
  
  parse: function(rawPeeringReq, callback) {
    var rawPR = rawPeeringReq;
    var sigIndex = rawPeeringReq.lastIndexOf("-----BEGIN");
    if(~sigIndex){
      this.signature = rawPeeringReq.substring(sigIndex);
      rawPR = rawPeeringReq.substring(0, sigIndex);
      try{
        this.sigDate = jpgp().signature(this.signature).signatureDate();
      }
      catch(ex){}
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
        {prop: "fingerprint",       regexp: /Fingerprint: (.*)/},
        {prop: "dns",               regexp: /Dns: (.*)/},
        {prop: "ipv4",              regexp: /IPv4: (.*)/},
        {prop: "ipv6",              regexp: /IPv6: (.*)/},
        {prop: "port",              regexp: /Port: (.*)/},
      ];
      var crlfCleaned = rawPR.replace(/\r\n/g, "\n");
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
    this.hash = sha1(rawPeeringReq).toUpperCase();
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

  getHost: function() {
    var host =
      (this.ipv6 ? this.ipv6 :
        (this.ipv4 ? this.ipv4 :
          (this.dns ? this.dns : '')));
    return host;
  },

  getURL: function() {
    var base =
      (this.ipv6 ? '[' + this.ipv6 + ']' :
        (this.ipv4 ? this.ipv4 :
          (this.dns ? this.dns : '')));
    if(this.port)
      base += ':' + this.port;
    return base;
  },

  getRaw: function() {
    var raw = "";
    raw += "Version: " + this.version + "\n";
    raw += "Currency: " + this.currency + "\n";
    raw += "Fingerprint: " + this.fingerprint + "\n";
    if(this.dns)
      raw += "Dns: " + this.dns + "\n";
    if(this.ipv4)
      raw += "IPv4: " + this.ipv4 + "\n";
    if(this.ipv6)
      raw += "IPv6: " + this.ipv6 + "\n";
    if(this.port)
      raw += "Port: " + this.port + "\n";
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
    'BAD_DNS': 152,
    'BAD_IPV4': 153,
    'BAD_IPV6': 154,
    'BAD_PORT': 155,
    'BAD_FINGERPRINT': 156,
    'NO_IP_GIVEN': 158
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
  if(!err){
    // DNS
    if(obj.dns && !obj.dns.match(/^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9])$/))
      err = {code: codes['BAD_DNS'], message: "Incorrect Dns field"};
  }
  if(!err){
    // IPv4
    if(obj.ipv4 && !obj.ipv4.match(/^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/))
      err = {code: codes['BAD_IPV4'], message: "Incorrect IPv4 field"};
  }
  if(!err){
    // IPv6
    if(obj.ipv6 && !obj.ipv6.match(/^((([0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){6}:[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){5}:([0-9A-Fa-f]{1,4}:)?[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){4}:([0-9A-Fa-f]{1,4}:){0,2}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){3}:([0-9A-Fa-f]{1,4}:){0,3}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){2}:([0-9A-Fa-f]{1,4}:){0,4}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){6}((b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b).){3}(b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b))|(([0-9A-Fa-f]{1,4}:){0,5}:((b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b).){3}(b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b))|(::([0-9A-Fa-f]{1,4}:){0,5}((b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b).){3}(b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b))|([0-9A-Fa-f]{1,4}::([0-9A-Fa-f]{1,4}:){0,5}[0-9A-Fa-f]{1,4})|(::([0-9A-Fa-f]{1,4}:){0,6}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){1,7}:))$/))
      err = {code: codes['BAD_IPV6'], message: "Incorrect IPv6 field"};
  }
  if(!err){
    // IP
    if(!obj.ipv4 && !obj.ipv6)
      err = {code: codes['NO_IP_GIVEN'], message: "It must be given at least one IP, either v4 or v6"};
  }
  if(!err){
    // Port
    if(obj.port && !(obj.port + "").match(/^\d+$/))
      err = {code: codes['BAD_PORT'], message: "Port must be provided and match an integer format"};
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

PeerSchema.statics.getTheOne = function (fingerprint, done) {
  async.waterfall([
    function (next){
      Peer.find({ fingerprint: fingerprint }, next);
    },
    function (peers, next){
      if(peers.length == 0){
        next('Unknown peer 0x' + fingerprint);
        return;
      }
      else{
        next(null, peers[0]);
      }
    },
  ], done);
}

var Peer = mongoose.model('Peer', PeerSchema);
