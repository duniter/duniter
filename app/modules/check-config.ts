const constants = require('../lib/constants');
const wizard = require('../lib/wizard');
const logger = require('../lib/logger').NewLogger('wizard');

module.exports = {
  duniter: {

    cli: [{
      name: 'check-config',
      desc: 'Checks the node\'s configuration',

      onConfiguredExecute: async (server:any) => {
        await server.checkConfig()
        logger.warn('Configuration seems correct.');
      }
    }]
  }
}
