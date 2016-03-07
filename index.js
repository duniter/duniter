"use strict";

var co = require('co');
var Server = require('./server');
var bma  = require('./app/lib/streams/bma');
var webmin  = require('./app/lib/streams/webmin');
var upnp = require('./app/lib/upnp');
var multicaster = require('./app/lib/streams/multicaster');
var logger = require('./app/lib/logger')('ucoin');

module.exports = function (dbConf, overConf) {
  return new Server(dbConf, overConf);
};

module.exports.statics = {

  enableHttpAdmin: (dbConf, overConf, httpLogs) => webmin(dbConf, overConf, [{
    ip: 'localhost',
    port: 9220
  }], httpLogs !== false),

  startNode: (server, conf) => co(function *() {

    logger.info(">> NODE STARTING");

    // Public http interface
    let bmapi = yield bma(server, null, conf.httplogs);

    // Routing documents
    server
    // The router asks for multicasting of documents
      .pipe(server.router())
      // The documents get sent to peers
      .pipe(multicaster(server.conf))
      // The multicaster may answer 'unreachable peer'
      .pipe(server.router());

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
      yield upnp(server.conf.port, server.conf.remoteport)
        .catch(function(err){
          logger.warn(err);
        });
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
    server.start();

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
