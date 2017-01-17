"use strict";

const Q = require('q');
const co = require('co');
const wizard = require('../lib/wizard');
const logger = require('../lib/logger')('wizard');

module.exports = {
  duniter: {

    wizard: {
      // The wizard itself also defines its personal tasks
      'currency': Q.nbind(wizard().configCurrency, null),
      'pow': Q.nbind(wizard().configPoW, null),
      'network': Q.nbind(wizard().configNetwork, null),
      'network-reconfigure': Q.nbind(wizard().configNetworkReconfigure, null),
      'ucp': Q.nbind(wizard().configUCP, null)
    },

    cli: [{
      name: 'wizard [step]',
      desc: 'Launch the configuration wizard.',

      onConfiguredExecute: (server, conf, program, params, wizardTasks) => co(function*() {
        const step = params[0];
        const tasks = step ? [wizardTasks[step]] : Object.values(wizardTasks);
        for (const task of tasks) {
          yield task(conf, program, server.logger);
        }
        // Check config
        yield server.checkConfig();
        yield server.dal.saveConf(conf);
        logger.debug("Configuration saved.");
      })
    }]
  }
};
