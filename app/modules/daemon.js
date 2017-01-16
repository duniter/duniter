"use strict";

const co = require('co');

module.exports = {
  duniter: {

    cli: [{
      name: 'start',
      desc: 'Start Duniter node daemon.',
      onPluggedDALExecute: (server, conf, program, params, startServices) => co(function*() {
        const logger = server.logger;
        const bma = require('../lib/streams/bma');

        logger.info(">> NODE STARTING");

        // Public http interface
        let bmapi = yield bma(server, null, conf.httplogs);

        // Routing documents
        server.routing();

        // Services
        yield server.startServices();
        yield bmapi.openConnections();
        yield startServices();

        logger.info('>> Server ready!');

        return new Promise(() => null); // Never ending
      })
    },{
      name: 'stop',
      desc: 'Stop Duniter node daemon.',
      logs: false,
      onConfiguredExecute: () => needsToBeLaunchedByScript()
    },{
      name: 'restart',
      desc: 'Restart Duniter node daemon.',
      logs: false,
      onConfiguredExecute: () => needsToBeLaunchedByScript()
    }]
  }
};

function needsToBeLaunchedByScript() {
  console.error('This command must not be launched directly, please use duniter.sh script');
}
