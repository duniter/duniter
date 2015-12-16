"use strict";
var _ = require('underscore');
var constants = require('../constants');

var defaultConf = function() {
  return {
    "currency": null,
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
    "c": constants.CONTRACT.DEFAULT.C,
    "dt": constants.CONTRACT.DEFAULT.DT,
    "ud0": constants.CONTRACT.DEFAULT.UD0,
    "stepMax": constants.CONTRACT.DEFAULT.STEPMAX,
    "sigDelay": constants.CONTRACT.DEFAULT.SIGDELAY,
    "sigValidity": constants.CONTRACT.DEFAULT.SIGVALIDITY,
    "msValidity": constants.CONTRACT.DEFAULT.MSVALIDITY,
    "sigQty": constants.CONTRACT.DEFAULT.SIGQTY,
    "sigWoT": constants.CONTRACT.DEFAULT.SIGWOT,
    "percentRot": constants.CONTRACT.DEFAULT.PERCENTROT,
    "blocksRot": constants.CONTRACT.DEFAULT.BLOCKSROT,
    "powDelay": constants.CONTRACT.DEFAULT.POWDELAY,
    "avgGenTime": constants.CONTRACT.DEFAULT.AVGGENTIME,
    "dtDiffEval": constants.CONTRACT.DEFAULT.DTDIFFEVAL,
    "medianTimeBlocks": constants.CONTRACT.DEFAULT.MEDIANTIMEBLOCKS,
    "participate": true,
    "httplogs": false,
    "udid2": false,
    "timeout": 3000,
    "routing": false,
    "isolate": false,
    "forksize": constants.BRANCHES.DEFAULT_WINDOW_SIZE
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
