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
var cors = require('cors');
var constants = require('./constants');
var sanitize = require('./sanitize');
var logger = require('../lib/logger')('network');

module.exports = {

  getBestLocalIPv4: () => getBestLocal('IPv4'),
  getBestLocalIPv6: () => getBestLocal('IPv6'),
  getLANIPv4: () => getLAN('IPv4'),
  getLANIPv6: () => getLAN('IPv6'),

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
    let publicIP = yield Q.nbind(client.externalIp, client)();
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

  createServersAndListen: (name, interfaces, httpLogs, staticPath, routingCallback, listenWebSocket) => co(function *() {

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

    // CORS for **any** HTTP request
    app.use(cors());

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

    if (staticPath) {
      app.use(express.static(staticPath));
    }

    var httpServers = interfaces.map(() => {
      let httpServer = http.createServer(app);
      let sockets = {}, nextSocketId = 0;
      httpServer.on('connection', function(socket) {
        let socketId = nextSocketId++;
        sockets[socketId] = socket;
        //logger.debug('socket %s opened', socketId);

        socket.on('close', () => {
          //logger.debug('socket %s closed', socketId);
          delete sockets[socketId];
        });
      });
      httpServer.on('error', function(err) {
        httpServer.errorPropagates(err);
      });
      listenWebSocket && listenWebSocket(httpServer);
      return {
        http: httpServer,
        closeSockets: () => {
          _.keys(sockets).map((socketId) => {
            sockets[socketId].destroy();
          });
        }
      };
    });

    // May be removed when using Node 5.x where httpServer.listening boolean exists
    var listenings = interfaces.map(() => false);

    if (httpServers.length == 0){
      throw 'uCoin does not have any interface to listen to.';
    }

    // Return API
    return {

      closeConnections: () => co(function *() {
        for (let i = 0, len = httpServers.length; i < len; i++) {
          let httpServer = httpServers[i].http;
          let isListening = listenings[i];
          if (isListening) {
            listenings[i] = false;
            logger.info(name + ' stop listening');
            yield Q.Promise((resolve, reject) => {
              httpServer.errorPropagates(function(err) {
                reject(err);
              });
              httpServers[i].closeSockets();
              httpServer.close(function(err) {
                err && logger.error(err.stack || err);
                resolve();
              });
            });
          }
        }
        return [];
      }),

      openConnections: () => co(function *() {
        for (let i = 0, len = httpServers.length; i < len; i++) {
          let httpServer = httpServers[i].http;
          let isListening = listenings[i];
          if (!isListening) {
            let netInterface = interfaces[i].ip;
            let port = interfaces[i].port;
            try {
              yield Q.Promise((resolve, reject) => {
                // Weird the need of such a hack to catch an exception...
                httpServer.errorPropagates = function(err) {
                  reject(err);
                };
                //httpServer.on('listening', resolve.bind(this, httpServer));
                httpServer.listen(port, netInterface, (err) => {
                  if (err) return reject(err);
                  listenings[i] = true;
                  resolve(httpServer);
                });
              });
              logger.info(name + ' listening on http://' + netInterface + ':' + port);
            } catch (e) {
              logger.warn('Could NOT listen to http://' + netInterface + ':' + port);
              logger.warn(e);
            }
          }
        }
        return [];
      })
    };
  })
};

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
    typeof e == 'string' && logger.error(e);
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

function getBestLocal(family) {
  let netInterfaces = os.networkInterfaces();
  let keys = _.keys(netInterfaces);
  let res = [];
  for (let i = 0, len = keys.length; i < len; i++) {
    let name = keys[i];
    let addresses = netInterfaces[name];
    for (let j = 0, len2 = addresses.length; j < len2; j++) {
      let addr = addresses[j];
      if (!family || addr.family == family) {
        res.push({
          name: name,
          value: addr.address
        });
      }
    }
  }
  return _.sortBy(res, function(entry) {
    if (entry.name.match(/^eth0/))  return 0;
    if (entry.name.match(/^eth1/))  return 1;
    if (entry.name.match(/^eth2/))  return 2;
    if (entry.name.match(/^wlan0/)) return 3;
    if (entry.name.match(/^wlan1/)) return 4;
    if (entry.name.match(/^wlan2/)) return 5;
    if (entry.name.match(/^lo/))    return 6;
    if (entry.name.match(/^None/))  return 7;
    return 10;
  })[0].value;
}

function getLAN(family) {
  let netInterfaces = os.networkInterfaces();
  let keys = _.keys(netInterfaces);
  let res = [];
  for (let i = 0, len = keys.length; i < len; i++) {
    let name = keys[i];
    let addresses = netInterfaces[name];
    for (let j = 0, len2 = addresses.length; j < len2; j++) {
      let addr = addresses[j];
      if ((addr.family == "IPv4" && family == "IPv4"
          && addr.address != "127.0.0.1" && addr.address != "lo" && addr.address != "localhost")
          || (addr.family == "IPv6" && family == "IPv6"
          && addr.address != "::1" && addr.address != "lo" && addr.address != "localhost"))
      {
        res.push({
          name: name,
          value: addr.address
        });
      }
    }
  }
  return res;
}
