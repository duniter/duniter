"use strict";
const _ = require('underscore');
const contacter = require('duniter-crawler').duniter.methods.contacter;
const rawer = require('duniter-common').rawer;
const constants = require('../constants');

module.exports = Peer;

const DEFAULT_HOST = 'localhost';

function Peer(json) {

  this.documentType = 'peer';

  _(json).keys().forEach((key) => {
    this[key] = json[key];
  });

  this.endpoints = this.endpoints || [];
  this.statusTS = this.statusTS || 0;

  this.keyID = () => this.pubkey && this.pubkey.length > 10 ? this.pubkey.substring(0, 10) : "Unknown";

  this.copyValues = (to) => {
    ["version", "currency", "pub", "endpoints", "hash", "status", "statusTS", "block", "signature"].forEach((key)=> {
      to[key] = this[key];
    });
  };

  this.copyValuesFrom = (from) => {
    ["version", "currency", "pub", "endpoints", "block", "signature"].forEach((key) => {
      this[key] = from[key];
    });
  };

  this.json = () => {
    const json = {};
    ["version", "currency", "endpoints", "status", "block", "signature"].forEach((key) => {
      json[key] = this[key];
    });
    json.raw = this.getRaw();
    json.pubkey = this.pubkey;
    return json;
  };

  this.getBMA = () => {
    let bma = null;
    this.endpoints.forEach((ep) => {
      const matches = !bma && ep.match(constants.BMA_REGEXP);
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

  this.getDns = () => {
    const bma = this.getBMA();
    return bma.dns ? bma.dns : null;
  };

  this.getIPv4 = () => {
    const bma = this.getBMA();
    return bma.ipv4 ? bma.ipv4 : null;
  };

  this.getIPv6 = () => {
    const bma = this.getBMA();
    return bma.ipv6 ? bma.ipv6 : null;
  };

  this.getPort = () => {
    const bma = this.getBMA();
    return bma.port ? bma.port : null;
  };

  this.getHostPreferDNS = () => {
    const bma = this.getBMA();
    return (bma.dns ? bma.dns :
      (bma.ipv4 ? bma.ipv4 :
        (bma.ipv6 ? bma.ipv6 : '')));
  };

  this.getURL = () => {
    const bma = this.getBMA();
    let base = this.getHostPreferDNS();
    if(bma.port)
      base += ':' + bma.port;
    return base;
  };

  this.hasValid4 = (bma) => bma.ipv4 && !bma.ipv4.match(/^127.0/) && !bma.ipv4.match(/^192.168/) ? true : false;

  this.getNamedURL = () => this.getURL();

  this.getRaw = () => rawer.getPeerWithoutSignature(this);

  this.getRawSigned = () => rawer.getPeer(this);

  this.connect = (timeout) => Promise.resolve(contacter(this.getDns() || this.getIPv6() || this.getIPv4() || DEFAULT_HOST, this.getPort(), {
    timeout: timeout || constants.NETWORK.DEFAULT_TIMEOUT
  }));

  this.isReachable = () => {
    return this.getURL() ? true : false;
  };

  this.containsEndpoint = (ep) => this.endpoints.reduce((found, endpoint) => found || endpoint == ep, false);

  this.endpointSum = () => this.endpoints.join('_');

  this.blockNumber = () => this.block.match(/^(\d+)-/)[1];
}

Peer.statics = {};

Peer.statics.peerize = function(p) {
  return p != null ? new Peer(p) : null;
};

Peer.statics.fromJSON = Peer.statics.peerize;

Peer.statics.endpoint2host = (endpoint) => Peer.statics.peerize({ endpoints: [endpoint] }).getURL();

Peer.statics.endpointSum = (obj) => Peer.statics.peerize(obj).endpointSum();

Peer.statics.blockNumber = (obj) => {
  const peer = Peer.statics.peerize(obj);
  return peer ? peer.blockNumber() : -1;
};
