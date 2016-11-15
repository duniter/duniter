"use strict";

const co = require('co');
const Server = require('./server');
const bma  = require('./app/lib/streams/bma');
const webmin  = require('./app/lib/streams/webmin');
const logger = require('./app/lib/logger')('duniter');

module.exports = function (dbConf, overConf) {
  return new Server(dbConf, overConf);
};

module.exports.statics = {

  logger: logger,

  /**************
   * Duniter used by its Command Line Interface
   * @param onService A callback for external usage when Duniter server is ready
   */
  cli: (onService) => {

    const cli = require('./app/cli');

    // Specific errors handling
    process.on('uncaughtException', (err) => {
      // Dunno why this specific exception is not caught
      if (err.code !== "EADDRNOTAVAIL" && err.code !== "EINVAL") {
        logger.error(err);
        process.exit(1);
      }
    });

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled rejection: ' + reason);
    });

    return co(function*() {
      try {
        // Prepare the command
        const command = cli(process.argv);
        // If ever the process gets interrupted
        process.on('SIGINT', () => {
          co(function*() {
            yield command.closeCommand();
            process.exit();
          });
        });
        // Executes the command
        yield command.execute(onService);
        process.exit();
      } catch (e) {
        logger.error(e);
        process.exit(1);
      }
    });

  },

  enableHttpAdmin: (dbConf, overConf, httpLogs, wmHost, wmPort) => webmin(dbConf, overConf, [{
    ip:  wmHost || 'localhost',
    port: wmPort || 9220
  }], httpLogs !== false),

  startNode: (server, conf) => co(function *() {

    logger.info(">> NODE STARTING");

    // Public http interface
    let bmapi = yield bma(server, null, conf.httplogs);

    // Routing documents
    server.routing();

    // Services
    yield module.exports.statics.startServices(server);
    yield bmapi.openConnections();

    logger.info('>> Server ready!');
  }),

  startServices: (server) => co(function *() {

    /***************
     * HTTP ROUTING
     **************/
    server.router(server.conf.routing);

    /***************
     *    UPnP
     **************/
    if (server.conf.upnp) {
      try {
        if (server.upnpAPI) {
          server.upnpAPI.stopRegular();
        }
        yield server.upnp();
        server.upnpAPI.startRegular();
      } catch (e) {
        logger.warn(e);
      }
    }

    /*******************
     * BLOCK COMPUTING
     ******************/
    if (server.conf.participate) {
      server.startBlockComputation();
    }

    /***********************
     * CRYPTO NETWORK LAYER
     **********************/
    yield server.start();

    return {};
  }),

  stopServices: (server) => co(function *() {

    server.router(false);
    if (server.conf.participate) {
      server.stopBlockComputation();
    }
    yield server.stop();

    return {};
  })
};
