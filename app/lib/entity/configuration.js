"use strict";
var _ = require('underscore');
var constants = require('../constants');

var defaultConf = function() {
  return {
    "currency": null,
    "c": 0.007376575,
    "dt": 30.4375 * 24 * 3600,
    "ud0": 100,
    "port": constants.NETWORK.DEFAULT_PORT,
    "ipv4": "127.0.0.1",
    "ipv6": null,
    "upnp": true,
    "remotehost": null,
    "remoteipv4": null,
    "remoteipv6": null,
    "remoteport": constants.NETWORK.DEFAULT_PORT,
    "salt": "",
    "passwd": "",
    "cpu": 0.9,
    "upInterval": 3600 * 1000,
    "stepMax": 3,
    "sigDelay": 3600 * 24 * 365 * 5,
    "sigValidity": 3600 * 24 * 365,
    "msValidity": 3600 * 24 * 365,
    "sigQty": 5,
    "sigWoT": 5,
    "percentRot": 2 / 3,
    "blocksRot": 20,
    "powDelay": 10,
    "participate": true,
    "tsInterval": 30,
    "avgGenTime": 16 * 60,
    "dtDiffEval": 10,
    "httplogs": false,
    "medianTimeBlocks": 20,
    "udid2": false,
    "timeout": 3000,
    "routing": false,
    "isolate": false
  };
};

var Configuration = function(json) {

  _(this).extend(defaultConf);
  _(this).extend(json);
};

Configuration.statics = {};

Configuration.statics.defaultConf = function () {
  return defaultConf();
};

Configuration.statics.complete = function (conf) {
  return _(defaultConf()).extend(conf);
};

module.exports = Configuration;
