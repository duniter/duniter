"use strict";

const co = require('co');

module.exports = {
  duniter: {

    cli: [{
      name: 'start',
      desc: 'Start Duniter node daemon.',
      onPluggedDALExecute: (server, conf, program, params, startServices) => co(function*() {
        const logger = server.logger;

        logger.info(">> Server starting...");

        yield server.checkConfig();
        // Add signing & public key functions to PeeringService
        logger.info('Node version: ' + server.version);
        logger.info('Node pubkey: ' + server.conf.pair.pub);

        // Services
        yield startServices();

        logger.info('>> Server ready!');

        return new Promise(() => null); // Never ending
      })
    },{
      name: 'stop',
      desc: 'Stop Duniter node daemon.',
      logs: false,
      onConfiguredExecute: (server) => needsToBeLaunchedByScript(server.logger)
    },{
      name: 'restart',
      desc: 'Restart Duniter node daemon.',
      logs: false,
      onConfiguredExecute: (server) => needsToBeLaunchedByScript(server.logger)
    }]
  }
};

function needsToBeLaunchedByScript(logger) {
  logger.error('This command must not be launched directly, please use duniter.sh script');
}
