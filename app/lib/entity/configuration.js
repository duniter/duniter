"use strict";
const _ = require('underscore');
const constants = require('../constants');

const defaultConf = function() {
  return {
    "currency": null,
    "endpoints": [],
    "rmEndpoints": [],
    "upInterval": 3600 * 1000,
    "c": constants.CONTRACT.DEFAULT.C,
    "dt": constants.CONTRACT.DEFAULT.DT,
    "ud0": constants.CONTRACT.DEFAULT.UD0,
    "stepMax": constants.CONTRACT.DEFAULT.STEPMAX,
    "sigPeriod": constants.CONTRACT.DEFAULT.SIGPERIOD,
    "sigValidity": constants.CONTRACT.DEFAULT.SIGVALIDITY,
    "msValidity": constants.CONTRACT.DEFAULT.MSVALIDITY,
    "sigQty": constants.CONTRACT.DEFAULT.SIGQTY,
    "xpercent": constants.CONTRACT.DEFAULT.X_PERCENT,
    "percentRot": constants.CONTRACT.DEFAULT.PERCENTROT,
    "powDelay": constants.CONTRACT.DEFAULT.POWDELAY,
    "avgGenTime": constants.CONTRACT.DEFAULT.AVGGENTIME,
    "dtDiffEval": constants.CONTRACT.DEFAULT.DTDIFFEVAL,
    "medianTimeBlocks": constants.CONTRACT.DEFAULT.MEDIANTIMEBLOCKS,
    "httplogs": false,
    "udid2": false,
    "timeout": 3000,
    "isolate": false,
    "forksize": constants.BRANCHES.DEFAULT_WINDOW_SIZE
  };
};

const Configuration = function(json) {

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
