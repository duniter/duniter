"use strict";

var co = require('co');
var os = require('os');
var Q = require('q');
var _ = require('underscore');
var upnp = require('nnupnp');
var http = require('http');
var express = require('express');
var morgan = require('morgan');
var errorhandler = require('errorhandler');
var bodyParser = require('body-parser');
var cors = require('express-cors');
var constants = require('./constants');
var sanitize = require('./sanitize');
var logger = require('../lib/logger')('network');

module.exports = {

  listInterfaces: () => {
    let netInterfaces = os.networkInterfaces();
    let keys = _.keys(netInterfaces);
    let res = [];
    for (let i = 0, len = keys.length; i < len; i++) {
      let name = keys[i];
      res.push({
        name: name,
        addresses: netInterfaces[name]
      });
    }
    return res;
  },

  upnpConf: (noupnp) => co(function *() {
    var conf = {};
    var client = upnp.createClient();
    // Look for 2 random ports
    var privatePort = module.exports.getRandomPort();
    var publicPort = privatePort;
    logger.info('Checking UPnP features...');
    if (noupnp) {
      throw Error('No UPnP');
    }
    let publicIP = yield Q.nfbind(client.externalIp, client)();
    yield Q.nbind(client.portMapping, client)({
      public: publicPort,
      private: privatePort,
      ttl: 120
    });
    let privateIP = yield Q.Promise((resolve, reject) => {
      client.findGateway((err, res, localIP) => {
        if (err) return reject(err);
        resolve(localIP);
      });
    });
    conf.remoteipv4 = publicIP.match(constants.IPV4_REGEXP) ? publicIP : null;
    conf.remoteipv6 = publicIP.match(constants.IPV6_REGEXP) ? publicIP : null;
    conf.remoteport = publicPort;
    conf.port = privatePort;
    conf.ipv4 = privateIP.match(constants.IPV4_REGEXP) ? privateIP : null;
    conf.ipv6 = privateIP.match(constants.IPV6_REGEXP) ? privateIP : null;
    return conf;
  }),

  getRandomPort: () => ~~(Math.random() * (65536 - constants.NETWORK.PORT.START)) + constants.NETWORK.PORT.START,

  createServersAndListen: (interfaces, httpLogs, routingCallback, listenWebSocket) => co(function *() {

    var app = express();

    // all environments
    if (httpLogs) {
      app.use(morgan('\x1b[90m:remote-addr - :method :url HTTP/:http-version :status :res[content-length] - :response-time ms\x1b[0m', {
        stream: {
          write: function(message){
            message && logger.info(message.replace(/\n$/,''));
          }
        }
      }));
    }

    app.use(cors({
      allowedOrigins: [
        '*:*'
      ]
    }));

    app.use(bodyParser.urlencoded({
      extended: true
    }));
    app.use(bodyParser.json());

    // development only
    if (app.get('env') == 'development') {
      app.use(errorhandler());
    }

    routingCallback(app, {
      httpGET:  (uri, promiseFunc, dtoContract) => handleRequest(app.get.bind(app), uri, promiseFunc, dtoContract),
      httpPOST: (uri, promiseFunc, dtoContract) => handleRequest(app.post.bind(app), uri, promiseFunc, dtoContract)
    });

    var httpServers = [];

    for (let i = 0, len = interfaces.length; i < len; i++) {
      let netInterface = interfaces[i];
      try {
        let httpServer = yield listenInterface(app, netInterface.ip, netInterface.port);
        listenWebSocket && listenWebSocket(httpServer);
        httpServers.push(httpServer);
        logger.info('uCoin server listening on ' + netInterface.ip + ' port ' + netInterface.port);
      } catch (err) {
        logger.error(err.message);
        logger.error('uCoin server cannot listen on ' + netInterface.ip + ' port ' + netInterface.port);
      }
    }

    if (httpServers.length == 0){
      throw 'uCoin does not have any interface to listen to.';
    }

    // Return API
    return {

      closeConnections: function () {
        return Q.all(httpServers.map(function (httpServer) {
          logger.info('uCoin server stop listening');
          return Q.nbind(httpServer.close, httpServer)();
        }));
      },

      reopenConnections: function () {
        return Q.all(httpServers.map(function (httpServer, index) {
          return Q.Promise(function (resolve, reject) {
            var netInterface = interfaces[index].ip;
            var port = interfaces[index].port;
            httpServer.listen(port, netInterface, function (err) {
              err ? reject(err) : resolve(httpServer);
              logger.info('uCoin server listening again on ' + netInterface + ' port ' + port);
            });
          });
        }));
      }
    };
  })
};

function listenInterface(app, netInterface, port) {
  return Q.Promise(function(resolve, reject){
    var httpServer = http.createServer(app);
    httpServer.on('error', reject);
    httpServer.on('listening', resolve.bind(this, httpServer));
    httpServer.listen(port, netInterface);
  });
}

function handleRequest(method, uri, promiseFunc, dtoContract) {
  method(uri, function(req, res) {
    res.set('Access-Control-Allow-Origin', '*');
    res.type('application/json');
    co(function *() {
      try {
        let result = yield promiseFunc(req);
        // Ensure of the answer format
        result = sanitize(result, dtoContract);
        // HTTP answer
        res.status(200).send(JSON.stringify(result, null, "  "));
      } catch (e) {
        let error = getResultingError(e);
        // HTTP error
        res.status(error.httpCode).send(JSON.stringify(error.uerr, null, "  "));
      }
    });
  });
}

function getResultingError(e) {
  // Default is 500 unknown error
  let error = constants.ERRORS.UNKNOWN;
  if (e) {
    // Print eventual stack trace
    e.stack && logger.error(e.stack);
    e.message && logger.warn(e.message);
    // BusinessException
    if (e.uerr) {
      error = e;
    } else {
      error = _.clone(constants.ERRORS.UNHANDLED);
      error.uerr.message = e.message || error.uerr.message;
    }
  }
  return error;
}
