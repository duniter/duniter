var _ = require('underscore');
var vucoin = require('vucoin');
var rawer = require('../rawer');

module.exports = Peer;

var STATUS = {
  ASK: "ASK",
  NEW: "NEW",
  NEW_BACK: "NEW_BACK",
  UP: "UP",
  DOWN: "DOWN",
  NOTHING: "NOTHING"
};
var BMA_REGEXP = /^BASIC_MERKLED_API( ([a-z_][a-z0-9-_.]*))?( ([0-9.]+))?( ([0-9a-f:]+))?( ([0-9]+))$/;

function Peer(json) {

  var that = this;

  _(json).keys().forEach(function(key) {
   that[key] = json[key];
  });

  this.endpoints = this.endpoints || [];
  this.statusTS = this.statusTS || 0;

  this.keyID = function () {
    return this.pubkey && this.pubkey.length > 10 ? this.pubkey.substring(0, 10) : "Unknown";
  };

  this.setStatus = function (newStatus, dal, done) {
    if(this.status != newStatus){
      this.status = newStatus;
      dal.savePeer(this, function (err) {
        done(err);
      });
    }
    else done();
  };

  this.copyValues = function(to) {
    var obj = this;
    ["version", "currency", "pub", "endpoints", "hash", "status", "statusTS", "block", "signature"].forEach(function (key) {
      to[key] = obj[key];
    });
  };

  this.copyValuesFrom = function(from) {
    var obj = this;
    ["version", "currency", "pub", "endpoints", "block", "signature"].forEach(function (key) {
      obj[key] = from[key];
    });
  };

  this.json = function() {
    var obj = this;
    var json = {};
    ["version", "currency", "endpoints", "status", "block", "signature"].forEach(function (key) {
      json[key] = obj[key];
    });
    json.raw = this.getRaw();
    json.pubkey = this.pubkey;
    return json;
  };

  this.getBMA = function() {
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
  };

  this.getDns = function() {
    var bma = this.getBMA();
    return bma.dns ? bma.dns : null;
  };

  this.getIPv4 = function() {
    var bma = this.getBMA();
    return bma.ipv4 ? bma.ipv4 : null;
  };

  this.getIPv6 = function() {
    var bma = this.getBMA();
    return bma.ipv6 ? bma.ipv6 : null;
  };

  this.getPort = function() {
    var bma = this.getBMA();
    return bma.port ? bma.port : null;
  };

  this.getHost = function() {
    var bma = this.getBMA();
    var host =
      (bma.ipv6 ? bma.ipv6 :
        (bma.ipv4 ? bma.ipv4 :
          (bma.dns ? bma.dns : '')));
    return host;
  };

  this.getURL = function() {
    var bma = this.getBMA();
    var base =
      (bma.ipv6 ? '[' + bma.ipv6 + ']' :
        (bma.ipv4 ? bma.ipv4 :
          (bma.dns ? bma.dns : '')));
    if(bma.port)
      base += ':' + bma.port;
    return base;
  };

  this.getNamedURL = function() {
    var bma = this.getBMA();
    var base =
      (bma.dns ? bma.dns :
        (bma.ipv4 ? bma.ipv4 :
          (bma.ipv6 ? '[' + bma.ipv6 + ']' : '')));
    if(bma.port)
      base += ':' + bma.port;
    return base;
  };

  this.getRaw = function() {
    return rawer.getPeerWithoutSignature(this);
  };

  this.getRawSigned = function() {
    return rawer.getPeer(this);
  };

  this.connect = function (done){
    vucoin(this.getIPv6() || this.getIPv4() || this.getDns(), this.getPort(), done);
  };

  this.isReachable = function () {
    return this.getURL() ? true : false;
  }
}

Peer.statics = {};

Peer.statics.peerize = function(p) {
  return p != null ? new Peer(p) : null;
};
