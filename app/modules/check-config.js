"use strict";

const co = require('co');
const constants = require('../lib/constants');
const wizard = require('../lib/wizard');
const logger = require('../lib/logger')('wizard');

module.exports = {
  duniter: {

    cli: [{
      name: 'check-config',
      desc: 'Checks the node\'s configuration',

      onConfiguredExecute: (server, conf, program, params, wizardTasks) => co(function*() {
        yield server.checkConfig()
        logger.warn('Configuration seems correct.');
      })
    }]
  }
};
