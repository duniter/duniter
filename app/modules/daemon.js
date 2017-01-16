"use strict";

const co = require('co');

module.exports = {
  duniter: {

    cli: [{
      name: 'start',
      desc: 'Start Duniter node daemon.',
      onPluggedDALExecute: (server, conf, program, params, startServices) => co(function*() {
        const logger = server.logger;

        logger.info(">> NODE STARTING");

        // Routing documents
        server.routing();

        // Services
        yield server.startServices();
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
