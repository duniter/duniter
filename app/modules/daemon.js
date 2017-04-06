"use strict";

const co = require('co');

module.exports = {
  duniter: {

    service: {
      process: (server) => ServerService(server)
    },

    cli: [{

      name: 'start',
      desc: 'Starts Duniter as a daemon (background task).',
      logs: false,
      onConfiguredExecute: (server, conf, program, params) => co(function*() {
        yield server.checkConfig()
        const daemon = server.getDaemon('direct_start', 'start')
        yield startDaemon(daemon)
      })
    }, {

      name: 'stop',
      desc: 'Stops Duniter daemon if it is running.',
      logs: false,
      onConfiguredExecute: (server, conf, program, params) => co(function*() {
        const daemon = server.getDaemon()
        yield stopDaemon(daemon)
      })
    }, {

      name: 'restart',
      desc: 'Stops Duniter daemon and restart it.',
      logs: false,
      onConfiguredExecute: (server, conf, program, params) => co(function*() {
        yield server.checkConfig()
        const daemon = server.getDaemon('direct_start', 'restart')
        yield stopDaemon(daemon)
        yield startDaemon(daemon)
      })
    }, {

      name: 'status',
      desc: 'Get Duniter daemon status.',
      logs: false,
      onConfiguredExecute: (server, conf, program, params) => co(function*() {
        yield server.checkConfig()
        const pid = server.getDaemon().status()
        if (pid) {
          console.log('Duniter is running using PID %s.', pid)
        } else {
          console.log('Duniter is not running.')
        }
      })
    }, {
    }, {

      name: 'direct_start',
      desc: 'Start Duniter node with direct output, non-daemonized.',
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
    }]
  }
};

function startDaemon(daemon) {
  return new Promise((resolve, reject) => daemon.start((err) => {
    if (err) return reject(err)
    resolve()
  }))
}

function stopDaemon(daemon) {
  return new Promise((resolve, reject) => daemon.stop((err) => {
    err && console.error(err);
    if (err) return reject(err)
    resolve()
  }))
}
}
