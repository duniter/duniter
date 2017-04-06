"use strict";

const co        = require('co');
const qfs       = require('q-io/fs');
const directory = require('../lib/system/directory');
const constants = require('../lib/constants');
const path      = require('path');
const Tail      = require("tail").Tail

module.exports = {
  duniter: {

    cliOptions: [
      { value: '--loglevel <level>', desc: 'Logs level, either [error,warning,info,debug,trace]. default to `info`.' }
    ],

    config: {

      /*****
       * Tries to load a specific parameter `conf.loglevel`
       */
      onLoading: (conf, program) => co(function*(){
        conf.loglevel = program.loglevel || conf.loglevel || 'trace'
      })
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

      name: 'logs',
      desc: 'Follow duniter logs.',
      logs: false,
      onConfiguredExecute: (server, conf, program, params) => co(function*() {
        printTailAndWatchFile(directory.INSTANCE_HOMELOG_FILE, constants.NB_INITIAL_LINES_TO_SHOW)
        // Never ending command
        return new Promise(res => null)
      })
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

function printTailAndWatchFile(file, tailSize) {
  return co(function*() {
    if (yield qfs.exists(file)) {
      const content = yield qfs.read(file)
      const lines = content.split('\n')
      const from = Math.max(0, lines.length - tailSize)
      const lastLines = lines.slice(from).join('\n')
      console.log(lastLines)
    }
    watchFile(file)
  })
}

function watchFile(file) {
  const tail = new Tail(file);

  // Specific errors handling
  process.on('uncaughtException', (err) => {
    if (err.code === "ENOENT") {
      console.error('EXCEPTION: ', err.message);
      setTimeout(() => watchFile(file), 1000) // Wait a second
    }
  });

  // On new line
  tail.on("line", function(data) {
    console.log(data);
  });

  tail.on("error", function(error) {
    console.error('ERROR: ', error);
  });
}
