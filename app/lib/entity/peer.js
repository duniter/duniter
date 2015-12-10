"use strict";
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

  that.endpoints = that.endpoints || [];
  that.statusTS = that.statusTS || 0;

  that.keyID = function () {
    return that.pubkey && that.pubkey.length > 10 ? that.pubkey.substring(0, 10) : "Unknown";
  };

  that.copyValues = function(to) {
    var obj = that;
    ["version", "currency", "pub", "endpoints", "hash", "status", "statusTS", "block", "signature"].forEach(function (key) {
      to[key] = obj[key];
    });
  };

  that.copyValuesFrom = function(from) {
    var obj = that;
    ["version", "currency", "pub", "endpoints", "block", "signature"].forEach(function (key) {
      obj[key] = from[key];
    });
  };

  that.json = function() {
    var obj = that;
    var json = {};
    ["version", "currency", "endpoints", "status", "block", "signature"].forEach(function (key) {
      json[key] = obj[key];
    });
    json.raw = that.getRaw();
    json.pubkey = that.pubkey;
    return json;
  };

  that.getBMA = function() {
    var bma = null;
    that.endpoints.forEach(function(ep){
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

  that.getDns = function() {
    var bma = that.getBMA();
    return bma.dns ? bma.dns : null;
  };

  that.getIPv4 = function() {
    var bma = that.getBMA();
    return bma.ipv4 ? bma.ipv4 : null;
  };

  that.getIPv6 = function() {
    var bma = that.getBMA();
    return bma.ipv6 ? bma.ipv6 : null;
  };

  that.getPort = function() {
    var bma = that.getBMA();
    return bma.port ? bma.port : null;
  };

  that.getHost = function() {
    var bma = that.getBMA();
    var host =
      (bma.ipv6 ? bma.ipv6 :
        (bma.ipv4 ? bma.ipv4 :
          (bma.dns ? bma.dns : '')));
    return host;
  };

  that.getHostPreferDNS = function() {
    var bma = that.getBMA();
    return (bma.dns ? bma.dns :
            (bma.ipv4 ? bma.ipv4 :
              (bma.ipv6 ? bma.ipv6 : '')));
  };

  that.getURL = function() {
    var bma = that.getBMA();
    var base =
      (bma.ipv6 ? '[' + bma.ipv6 + ']' :
        (bma.ipv4 ? bma.ipv4 :
          (bma.dns ? bma.dns : '')));
    if(bma.port)
      base += ':' + bma.port;
    return base;
  };

  that.getNamedURL = function() {
    var bma = that.getBMA();
    var base =
      (bma.dns ? bma.dns :
        (bma.ipv4 ? bma.ipv4 :
          (bma.ipv6 ? '[' + bma.ipv6 + ']' : '')));
    if(bma.port)
      base += ':' + bma.port;
    return base;
  };

  that.getRaw = function() {
    return rawer.getPeerWithoutSignature(that);
  };

  that.getRawSigned = function() {
    return rawer.getPeer(that);
  };

  that.connect = function (done){
    vucoin(that.getDns() || that.getIPv6() || that.getIPv4(), that.getPort(), done, {
      timeout: 2000
    });
  };

  that.isReachable = function () {
    return that.getURL() ? true : false;
  };
}

Peer.statics = {};

Peer.statics.peerize = function(p) {
  return p != null ? new Peer(p) : null;
};
