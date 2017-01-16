"use strict";

const co = require('co');
const constants = require('../lib/constants');
const wizard = require('../lib/wizard');
const logger = require('../lib/logger')('wizard');

module.exports = {
  duniter: {

    cli: [{
      name: 'reset [config|data|peers|tx|stats|all]',
      desc: 'Reset configuration, data, peers, transactions or everything in the database',

      onConfiguredExecute: (server, conf, program, params, wizardTasks) => co(function*() {
        const type = params[0];
        if (type === 'peers') {
          // Needs the DAL plugged
          yield server.initDAL();
        }
        switch (type) {
          case 'data':
            yield server.resetData();
            logger.warn('Data successfully reseted.');
            break;
          case 'peers':
            yield server.resetPeers();
            logger.warn('Peers successfully reseted.');
            break;
          case 'stats':
            yield server.resetStats();
            logger.warn('Stats successfully reseted.');
            break;
          case 'config':
            yield server.resetConf();
            logger.warn('Configuration successfully reseted.');
            break;
          case 'all':
            yield server.resetAll();
            logger.warn('Data & Configuration successfully reseted.');
            break;
          default:
            throw constants.ERRORS.CLI_CALLERR_RESET;
        }
      })
    }]
  }
};
