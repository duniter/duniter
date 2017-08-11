import {ConfDTO} from "../dto/ConfDTO"
import {CommonConstants} from "../common-libs/constants"

const constants = CommonConstants

export function maxAcceleration (conf:ConfDTO) {
  let maxGenTime = Math.ceil(conf.avgGenTime * constants.POW_DIFFICULTY_RANGE_RATIO);
  return Math.ceil(maxGenTime * conf.medianTimeBlocks);
}
