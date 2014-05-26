var mongoose = require('mongoose');
var async    = require('async');
var sha1     = require('sha1');
var jpgp     = require('../lib/jpgp');
var _        = require('underscore');
var vucoin   = require('vucoin');
var Schema   = mongoose.Schema;

var STATUS = {
  ASK: "ASK",
  NEW: "NEW",
  NEW_BACK: "NEW_BACK",
  UP: "UP",
  DOWN: "DOWN",
  NOTHING: "NOTHING"
};
var BMA_REGEXP = /^BASIC_MERKLED_API( ([a-z_][a-z0-9-_.]+))?( ([0-9.]+))?( ([0-9a-f:]+))?( ([0-9]+))$/;

var PeerSchema = new Schema({
  version: String,
  currency: String,
  fingerprint: { type: String, unique: true },
  endpoints: [String],
  signature: String,
  hash: String,
  status: { type: String, default: STATUS.NOTHING },
  statusSent: { type: String, default: STATUS.NOTHING },
  statusSigDate: { type: Date, default: function(){ return new Date(0); } },
  propagated: { type: Boolean, default: false },
  sigDate: { type: Date, default: function(){ return new Date(0); } },
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

PeerSchema.pre('save', function (next) {
  this.updated = Date.now();
  next();
});

PeerSchema.methods = {

  keyID: function () {
    return this.fingerprint && this.fingerprint.length > 24 ? "0x" + this.fingerprint.substring(24) : "0x?";
  },

  setStatus: function (newStatus, done) {
    if(this.status != newStatus){
      this.status = newStatus;
      this.save(function (err) {
        done(err);
      });
      return;
    }
    else done();
  },
  
  copyValues: function(to) {
    var obj = this;
    ["version", "currency", "fingerprint", "endpoints", "hash", "status", "signature"].forEach(function (key) {
      to[key] = obj[key];
    });
  },
  
  copyValuesFrom: function(from) {
    var obj = this;
    ["version", "currency", "fingerprint", "endpoints", "signature"].forEach(function (key) {
      obj[key] = from[key];
    });
  },
  
  json: function() {
    var obj = this;
    var json = {};
    ["version", "currency", "fingerprint", "endpoints", "status", "signature"].forEach(function (key) {
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
        {prop: "endpoints",         regexp: /Endpoints:\r\n(.*)/},
      ];
      var crlfCleaned = rawPR.replace(/\r\n/g, "\n");
      if(crlfCleaned.match(/\n$/)){
        captures.forEach(function (cap) {
          if (cap.prop != 'endpoints') {
            simpleLineExtraction(obj, crlfCleaned, cap);
          } else {
            var fieldValue = rawPR.match(cap.regexp);
            if(fieldValue && fieldValue.length === 2){
              obj[cap.prop] = fieldValue[1].split('\n');
            }
          }
        });
      }
      else{
        callback("Bad document structure: no new line character at the end of the document.");
        return false;
      }
    }
    this.hash = this.fingerprint;
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

  getBMA: function() {
    var bma = null;
    this.endpoints.forEach(function(ep){
      var matches = !bma && ep.match(BMA_REGEXP);
      if (matches) {
        bma = {
          "dns": matches[2] || '',
          "ipv4": matches[4] || '',
          "ipv6": matches[6] || '',
          "port": matches[8] || 9101
        };
      }
    });
    return bma || {};
  },

  getDns: function() {
    var bma = this.getBMA();
    return bma.dns ? bma.dns : null;
  },

  getIPv4: function() {
    var bma = this.getBMA();
    return bma.ipv4 ? bma.ipv4 : null;
  },

  getIPv6: function() {
    var bma = this.getBMA();
    return bma.ipv6 ? bma.ipv6 : null;
  },

  getPort: function() {
    var bma = this.getBMA();
    return bma.port ? bma.port : null;
  },

  getHost: function() {
    var bma = this.getBMA();
    var host =
      (bma.ipv6 ? bma.ipv6 :
        (bma.ipv4 ? bma.ipv4 :
          (bma.dns ? bma.dns : '')));
    return host;
  },

  getURL: function() {
    var bma = this.getBMA();
    var base =
      (bma.ipv6 ? '[' + bma.ipv6 + ']' :
        (bma.ipv4 ? bma.ipv4 :
          (bma.dns ? bma.dns : '')));
    if(bma.port)
      base += ':' + bma.port;
    return base;
  },

  getRaw: function() {
    var raw = "";
    raw += "Version: " + this.version + "\n";
    raw += "Currency: " + this.currency + "\n";
    raw += "Fingerprint: " + this.fingerprint + "\n";
    raw += "Endpoints:" + "\n";
    this.endpoints.forEach(function(ep){
      raw += ep + "\n";
    });
    return raw.unix2dos();
  },

  getRawSigned: function() {
    var raw = this.getRaw() + this.signature;
    return raw;
  },

  connect: function (done){
    var WITH_SIGNATURE_PARAM = false;
    vucoin(this.getIPv6() || this.getIPv4() || this.getDns(), this.getPort(), true, WITH_SIGNATURE_PARAM, done);
  },

  isReachable: function () {
    return this.getURL() ? true : false;
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
  // Basic Merkled API requirements
  var bma = obj.getBMA();
  if(!err){
    // DNS
    if(bma.dns && !bma.dns.match(/^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9])$/))
      err = {code: codes['BAD_DNS'], message: "Incorrect Dns field"};
  }
  if(!err){
    // IPv4
    if(bma.ipv4 && !bma.ipv4.match(/^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/))
      err = {code: codes['BAD_IPV4'], message: "Incorrect IPv4 field"};
  }
  if(!err){
    // IPv6
    if(bma.ipv6 && !bma.ipv6.match(/^((([0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){6}:[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){5}:([0-9A-Fa-f]{1,4}:)?[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){4}:([0-9A-Fa-f]{1,4}:){0,2}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){3}:([0-9A-Fa-f]{1,4}:){0,3}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){2}:([0-9A-Fa-f]{1,4}:){0,4}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){6}((b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b).){3}(b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b))|(([0-9A-Fa-f]{1,4}:){0,5}:((b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b).){3}(b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b))|(::([0-9A-Fa-f]{1,4}:){0,5}((b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b).){3}(b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b))|([0-9A-Fa-f]{1,4}::([0-9A-Fa-f]{1,4}:){0,5}[0-9A-Fa-f]{1,4})|(::([0-9A-Fa-f]{1,4}:){0,6}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){1,7}:))$/))
      err = {code: codes['BAD_IPV6'], message: "Incorrect IPv6 field"};
  }
  if(!err){
    // IP
    if(!bma.ipv4 && !bma.ipv6)
      err = {code: codes['NO_IP_GIVEN'], message: "It must be given at least one IP, either v4 or v6"};
  }
  if(!err){
    // Port
    if(bma.port && !(bma.port + "").match(/^\d+$/))
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

PeerSchema.statics.getTheOne = function (fpr, done) {
  async.waterfall([
    function (next){
      Peer.find({ fingerprint: fpr }, next);
    },
    function (peers, next){
      if(peers.length == 0){
        next('Unknown peer 0x' + fpr);
        return;
      }
      else{
        next(null, peers[0]);
      }
    },
  ], done);
};

PeerSchema.statics.getList = function (fingerprints, done) {
  Peer.find({ fingerprint: { $in: fingerprints }}, done);
};

PeerSchema.statics.allBut = function (fingerprints, done) {
  Peer.find({ fingerprint: { $nin: fingerprints } }, done);
};

/**
* Look for 10 last updated peers, and choose randomly 4 peers in it
*/
PeerSchema.statics.getRandomlyWithout = function (fingerprints, done) {
  async.waterfall([
    function (next){
      Peer.find({ fingerprint: { $nin: fingerprints }, status: { $in: ['NEW_BACK', 'UP'] } })
      .sort({ 'updated': -1 })
      .limit(10)
      .exec(next);
    },
    function (records, next){
      var peers = [];
      var recordsLength = records.length;
      for (var i = 0; i < Math.min(recordsLength, 4); i++) {
        var randIndex = Math.max(Math.floor(Math.random()*10) - (10 - recordsLength) - i, 0);
        peers.push(records[randIndex]);
        records.splice(randIndex, 1);
      }
      next(null, peers);
    },
  ], done);
};

PeerSchema.statics.status = STATUS;

var Peer = mongoose.model('Peer', PeerSchema);
