import {Server} from "../../server"

const constants = require('../lib/constants');
const wizard = require('../lib/wizard');

module.exports = {
  duniter: {

    cli: [{
      name: 'check-config',
      desc: 'Checks the node\'s configuration',

      onConfiguredExecute: async (server:Server) => {
        await server.checkConfig()
        const logger = require('../lib/logger').NewLogger('wizard')
        logger.warn('Configuration seems correct.');
      }
    }]
  }
}
