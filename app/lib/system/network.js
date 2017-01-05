"use strict";

const co = require('co');
const os = require('os');
const Q = require('q');
const _ = require('underscore');
const upnp = require('nnupnp');
const ddos = require('ddos');
const http = require('http');
const express = require('express');
const morgan = require('morgan');
const errorhandler = require('errorhandler');
const bodyParser = require('body-parser');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const constants = require('../constants');
const sanitize = require('../streams/sanitize');
const logger = require('../logger')('network');

module.exports = {

  getBestLocalIPv4: () => getBestLocal('IPv4'),
  getBestLocalIPv6: function getFirstGlobalIPv6() {
    const osInterfaces = module.exports.listInterfaces();
    for (let netInterface of osInterfaces) {
      const addresses = netInterface.addresses;
      const filtered = _(addresses).where({family: 'IPv6', scopeid: 0, internal: false });
      const filtered2 = _(filtered).filter((address) => !address.address.match(/^fe80/) && !address.address.match(/^::1/));
      if (filtered2[0]) {
        return filtered2[0].address;
      }
    }
    return null;
  },
  getLANIPv4: () => getLAN('IPv4'),
  getLANIPv6: () => getLAN('IPv6'),

  listInterfaces: () => {
    const netInterfaces = os.networkInterfaces();
    const keys = _.keys(netInterfaces);
    const res = [];
    for (const name of keys) {
      res.push({
        name: name,
        addresses: netInterfaces[name]
      });
    }
    return res;
  },

  upnpConf: (noupnp) => co(function *() {
    const conf = {};
    const client = upnp.createClient();
    // Look for 2 random ports
    const privatePort = module.exports.getRandomPort(conf);
    const publicPort = privatePort;
    logger.info('Checking UPnP features...');
    if (noupnp) {
      throw Error('No UPnP');
    }
    const publicIP = yield Q.nbind(client.externalIp, client)();
    yield Q.nbind(client.portMapping, client)({
      public: publicPort,
      private: privatePort,
      ttl: 120
    });
    const privateIP = yield Q.Promise((resolve, reject) => {
      client.findGateway((err, res, localIP) => {
        if (err) return reject(err);
        resolve(localIP);
      });
    });
    conf.remoteipv4 = publicIP.match(constants.IPV4_REGEXP) ? publicIP : null;
    conf.remoteport = publicPort;
    conf.port = privatePort;
    conf.ipv4 = privateIP.match(constants.IPV4_REGEXP) ? privateIP : null;
    return conf;
  }),

  getRandomPort: (conf) => {
    if (conf && conf.remoteport) {
      return conf.remoteport;
    } else {
      return ~~(Math.random() * (65536 - constants.NETWORK.PORT.START)) + constants.NETWORK.PORT.START;
    }
  },

  createServersAndListen: (name, interfaces, httpLogs, staticPath, routingCallback, listenWebSocket, enableFileUpload) => co(function *() {

    const app = express();

    // all environments
    if (httpLogs) {
      app.use(morgan('\x1b[90m:remote-addr - :method :url HTTP/:http-version :status :res[content-length] - :response-time ms\x1b[0m', {
        stream: {
          write: function(message){
            message && logger.trace(message.replace(/\n$/,''));
          }
        }
      }));
    }

    // DDOS protection
    const whitelist = interfaces.map(i => i.ip);
    if (whitelist.indexOf('127.0.0.1') === -1) {
      whitelist.push('127.0.0.1');
    }
    const ddosInstance = new ddos({ whitelist, silentStart: true });
    app.use(ddosInstance.express);

    // CORS for **any** HTTP request
    app.use(cors());

    if (enableFileUpload) {
      // File upload for backup API
      app.use(fileUpload());
    }

    app.use(bodyParser.urlencoded({
      extended: true
    }));
    app.use(bodyParser.json());

    // development only
    if (app.get('env') == 'development') {
      app.use(errorhandler());
    }

    routingCallback(app, {
      httpGET:     (uri, promiseFunc, dtoContract, limiter) => handleRequest(app.get.bind(app), uri, promiseFunc, dtoContract, limiter),
      httpPOST:    (uri, promiseFunc, dtoContract, limiter) => handleRequest(app.post.bind(app), uri, promiseFunc, dtoContract, limiter),
      httpGETFile: (uri, promiseFunc, dtoContract, limiter) => handleFileRequest(app.get.bind(app), uri, promiseFunc, limiter)
    });

    if (staticPath) {
      app.use(express.static(staticPath));
    }

    const httpServers = interfaces.map(() => {
      const httpServer = http.createServer(app);
      const sockets = {};
      let nextSocketId = 0;
      httpServer.on('connection', (socket) => {
        const socketId = nextSocketId++;
        sockets[socketId] = socket;
        //logger.debug('socket %s opened', socketId);

        socket.on('close', () => {
          //logger.debug('socket %s closed', socketId);
          delete sockets[socketId];
        });
      });
      httpServer.on('error', (err) => {
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
    const listenings = interfaces.map(() => false);

    if (httpServers.length == 0){
      throw 'Duniter does not have any interface to listen to.';
    }

    // Return API
    return {

      getDDOS: () => ddosInstance,

      closeConnections: () => co(function *() {
        for (let i = 0, len = httpServers.length; i < len; i++) {
          const httpServer = httpServers[i].http;
          const isListening = listenings[i];
          if (isListening) {
            listenings[i] = false;
            logger.info(name + ' stop listening');
            yield Q.Promise((resolve, reject) => {
              httpServer.errorPropagates((err) => {
                reject(err);
              });
              httpServers[i].closeSockets();
              httpServer.close((err) => {
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
          const httpServer = httpServers[i].http;
          const isListening = listenings[i];
          if (!isListening) {
            const netInterface = interfaces[i].ip;
            const port = interfaces[i].port;
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
              logger.info(name + ' listening on http://' + (netInterface.match(/:/) ? '[' + netInterface + ']' : netInterface) + ':' + port);
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

const handleRequest = (method, uri, promiseFunc, dtoContract, theLimiter) => {
  const limiter = theLimiter || require('../system/limiter').limitAsUnlimited();
  method(uri, function(req, res) {
    res.set('Access-Control-Allow-Origin', '*');
    res.type('application/json');
    co(function *() {
      try {
        if (!limiter.canAnswerNow()) {
          throw constants.ERRORS.HTTP_LIMITATION;
        }
        limiter.processRequest();
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
};

const handleFileRequest = (method, uri, promiseFunc, theLimiter) => {
  const limiter = theLimiter || require('../system/limiter').limitAsUnlimited();
  method(uri, function(req, res) {
    res.set('Access-Control-Allow-Origin', '*');
    co(function *() {
      try {
        if (!limiter.canAnswerNow()) {
          throw constants.ERRORS.HTTP_LIMITATION;
        }
        limiter.processRequest();
        let fileStream = yield promiseFunc(req);
        // HTTP answer
        fileStream.pipe(res);
      } catch (e) {
        let error = getResultingError(e);
        // HTTP error
        res.status(error.httpCode).send(JSON.stringify(error.uerr, null, "  "));
        throw e
      }
    });
  });
};

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
      const cp = constants.ERRORS.UNHANDLED;
      error = {
        httpCode: cp.httpCode,
        uerr: {
          ucode: cp.uerr.ucode,
          message: e.message || e || error.uerr.message
        }
      };
    }
  }
  return error;
}

function getBestLocal(family) {
  let netInterfaces = os.networkInterfaces();
  let keys = _.keys(netInterfaces);
  let res = [];
  for (const name of keys) {
    let addresses = netInterfaces[name];
    for (const addr of addresses) {
      if (!family || addr.family == family) {
        res.push({
          name: name,
          value: addr.address
        });
      }
    }
  }
  const interfacePriorityRegCatcher = [
    /^tun\d/,
    /^enp\ds\d/,
    /^enp\ds\df\d/,
    /^eth\d/,
    /^Ethernet/,
    /^wlp\ds\d/,
    /^wlan\d/,
    /^Wi-Fi/,
    /^lo/,
    /^Loopback/,
    /^None/
  ];
  const best = _.sortBy(res, function(entry) {
    for(let priority in interfacePriorityRegCatcher){
      if (entry.name.match(interfacePriorityRegCatcher[priority])) return priority;
    }
    return interfacePriorityRegCatcher.length;
  })[0];
  return (best && best.value) || "";
}

function getLAN(family) {
  let netInterfaces = os.networkInterfaces();
  let keys = _.keys(netInterfaces);
  let res = [];
  for (const name of keys) {
    let addresses = netInterfaces[name];
    for (const addr of addresses) {
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
