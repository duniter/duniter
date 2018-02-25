"use strict";
import {ConfDTO} from "../lib/dto/ConfDTO"
import {Server} from "../../server"

const constants = require('../lib/constants');
const wizard = require('../lib/wizard');
const logger = require('../lib/logger').NewLogger('wizard');

module.exports = {
  duniter: {

    cli: [{
      name: 'reset [config|data|peers|tx|stats|all]',
      desc: 'Reset configuration, data, peers, transactions or everything in the database',
      preventIfRunning: true,

      onConfiguredExecute: async (server:Server, conf:ConfDTO, program:any, params:any) => {
        const type = params[0];
        if (type === 'peers') {
          // Needs the DAL plugged
          await server.initDAL();
        }
        switch (type) {
          case 'data':
            await server.resetData();
            logger.warn('Data successfully reseted.');
            break;
          case 'peers':
            await server.resetPeers();
            logger.warn('Peers successfully reseted.');
            break;
          case 'stats':
            await server.resetStats();
            logger.warn('Stats successfully reseted.');
            break;
          case 'config':
            await server.resetConf();
            logger.warn('Configuration successfully reseted.');
            break;
          case 'all':
            await server.resetAll();
            logger.warn('Data & Configuration successfully reseted.');
            break;
          default:
            throw constants.ERRORS.CLI_CALLERR_RESET;
        }
      }
    }]
  }
};
