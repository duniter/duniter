"use strict";
import {ConfDTO} from "../lib/dto/ConfDTO"
import {CommonConstants} from "../lib/common-libs/constants"

module.exports = {
  duniter: {

    config: {
      onLoading: async (conf:ConfDTO) => {
        conf.msPeriod = conf.msWindow
        conf.switchOnHeadAdvance = CommonConstants.SWITCH_ON_BRANCH_AHEAD_BY_X_BLOCKS
      },
      beforeSave: async (conf:ConfDTO) => {
        conf.msPeriod = conf.msWindow
        conf.switchOnHeadAdvance = CommonConstants.SWITCH_ON_BRANCH_AHEAD_BY_X_BLOCKS
      }
    },

    cli: [{
      name: 'config',
      desc: 'Register configuration in database',
      // The command does nothing particular, it just stops the process right after configuration phase is over
      onConfiguredExecute: (server:any, conf:ConfDTO) => Promise.resolve(conf)
    }]
  }
}
