"use strict";

const co = require('co');
const os = require('os');
const _ = require('underscore');
const logger = require('../logger')('network');

const bmapiMethods = require('duniter-bma').duniter.methods;

module.exports = {

  getEndpoint: getEndpoint,
  getBestLocalIPv4: bmapiMethods.getBestLocalIPv4,
  getBestLocalIPv6: bmapiMethods.getBestLocalIPv6,

  listInterfaces: bmapiMethods.listInterfaces,

  upnpConf: (noupnp, logger) => bmapiMethods.upnpConf(noupnp, logger),

  getRandomPort: bmapiMethods.getRandomPort,

  createServersAndListen: require('duniter-bma').duniter.methods.createServersAndListen
};

function getEndpoint(theConf) {
  let endpoint = 'BASIC_MERKLED_API';
  if (theConf.remotehost) {
    endpoint += ' ' + theConf.remotehost;
  }
  if (theConf.remoteipv4) {
    endpoint += ' ' + theConf.remoteipv4;
  }
  if (theConf.remoteipv6) {
    endpoint += ' ' + theConf.remoteipv6;
  }
  if (theConf.remoteport) {
    endpoint += ' ' + theConf.remoteport;
  }
  return endpoint;
}
