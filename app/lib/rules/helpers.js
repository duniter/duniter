"use strict";

const common    = require('duniter-common');
const constants = common.constants

module.exports = {
  maxAcceleration
}

function maxAcceleration (conf) {
  let maxGenTime = Math.ceil(conf.avgGenTime * constants.POW_DIFFICULTY_RANGE_RATIO);
  return Math.ceil(maxGenTime * conf.medianTimeBlocks);
}
