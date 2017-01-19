"use strict";

const co = require('co');

module.exports = {
  duniter: {

    service: {
      process: (server) => ServerService(server)
    },

    cli: [{
      name: 'start',
      desc: 'Start Duniter node daemon.',
      onDatabaseExecute: (server, conf, program, params, startServices) => co(function*() {
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

function ServerService(server) {
  server.startService = () => Promise.resolve();
  server.stopService = () => Promise.resolve();
  return server;
}

function needsToBeLaunchedByScript(logger) {
  logger.error('This command must not be launched directly, please use duniter.sh script');
}
