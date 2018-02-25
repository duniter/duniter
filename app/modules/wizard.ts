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

import {ConfDTO} from "../lib/dto/ConfDTO"
import {Server} from "../../server"
import {Wizard} from "../lib/wizard"

const _ = require('underscore')
const logger = require('../lib/logger').NewLogger('wizard');

module.exports = {
  duniter: {

    wizard: {
      // The wizard itself also defines its personal tasks
      'currency': (conf:ConfDTO) => Wizard.configCurrency(conf),
      'pow': (conf:ConfDTO) => Wizard.configPoW(conf),
      'parameters': (conf:ConfDTO) => Wizard.configUCP(conf)
    },

    cli: [{
      name: 'wizard [key|network|network-reconfigure|currency|pow|parameters]',
      desc: 'Launch the configuration wizard.',

      onConfiguredExecute: async (server:Server, conf:ConfDTO, program:any, params:any, wizardTasks:any) => {
        const step = params[0];
        const tasks = step ? [wizardTasks[step]] : _.values(wizardTasks);
        for (const task of tasks) {
          if (!task) {
            throw 'Unknown task';
          }
          await task(conf, program)
        }
        // Check config
        await server.checkConfig();
        await server.dal.saveConf(conf);
        logger.debug("Configuration saved.");
      }
    }]
  }
};
