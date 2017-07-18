import {ConfDTO} from "../dto/ConfDTO"

const common    = require('duniter-common');
const constants = common.constants

export function maxAcceleration (conf:ConfDTO) {
  let maxGenTime = Math.ceil(conf.avgGenTime * constants.POW_DIFFICULTY_RANGE_RATIO);
  return Math.ceil(maxGenTime * conf.medianTimeBlocks);
}
