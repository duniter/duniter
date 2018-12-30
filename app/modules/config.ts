// Source file from duniter: Crypto-currency software to manage libre currency such as Ğ1
// Copyright (C) 2018  Cedric Moreau <cem.moreau@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

"use strict";
import {ConfDTO} from "../lib/dto/ConfDTO"
import {Server} from "../../server"
import {CommonConstants} from "../lib/common-libs/constants"

module.exports = {
  duniter: {

    config: {
      onLoading: async (conf:ConfDTO) => {
        conf.msPeriod = conf.msWindow
        conf.sigReplay = conf.msPeriod
        conf.switchOnHeadAdvance = CommonConstants.SWITCH_ON_BRANCH_AHEAD_BY_X_BLOCKS
      },
      beforeSave: async (conf:ConfDTO) => {
        conf.msPeriod = conf.msWindow
        conf.sigReplay = conf.msPeriod
        conf.switchOnHeadAdvance = CommonConstants.SWITCH_ON_BRANCH_AHEAD_BY_X_BLOCKS
      }
    },

    cli: [{
      name: 'config',
      desc: 'Register configuration in database',
      // The command does nothing particular, it just stops the process right after configuration phase is over
      onConfiguredExecute: (server:Server, conf:ConfDTO) => Promise.resolve(conf)
    }]
  }
}
