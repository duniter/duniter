import {ConfDTO} from "../lib/dto/ConfDTO"

const _ = require('underscore')
const wizard = require('../lib/wizard');
const logger = require('../lib/logger').NewLogger('wizard');

module.exports = {
  duniter: {

    wizard: {
      // The wizard itself also defines its personal tasks
      'currency': (conf:ConfDTO) => wizard().configCurrency(conf),
      'pow': (conf:ConfDTO) => wizard().configPoW(conf),
      'parameters': (conf:ConfDTO) => wizard().configUCP(conf)
    },

    cli: [{
      name: 'wizard [key|network|network-reconfigure|currency|pow|parameters]',
      desc: 'Launch the configuration wizard.',

      onConfiguredExecute: async (server:any, conf:ConfDTO, program:any, params:any, wizardTasks:any) => {
        const step = params[0];
        const tasks = step ? [wizardTasks[step]] : _.values(wizardTasks);
        for (const task of tasks) {
          if (!task) {
            throw 'Unknown task';
          }
          await task(conf)
        }
        // Check config
        await server.checkConfig();
        await server.dal.saveConf(conf);
        logger.debug("Configuration saved.");
      }
    }]
  }
};
