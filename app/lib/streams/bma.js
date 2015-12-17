var http = require('http');
var express = require('express');
var log4js = require('log4js');
var co = require('co');
var Q = require('q');
var cors = require('express-cors');
var es = require('event-stream');

var logger = require('../../lib/logger')('bma');

module.exports = function(server, interfaces, httpLogs) {

  "use strict";

  var httpLogger  = log4js.getLogger();
  var app = express();

  if (!interfaces) {
    interfaces = [{
      ip: server.conf.ipv4,
      port: server.conf.port
    }];
    if (server.conf.ipv6) {
      interfaces.push({
        ip: server.conf.ipv6,
        port: server.conf.port
      });
    }
  }

  // all environments
  if (httpLogs) {
    app.use(log4js.connectLogger(httpLogger, {
      format: '\x1b[90m:remote-addr - :method :url HTTP/:http-version :status :res[content-length] - :response-time ms\x1b[0m'
    }));
  }
  //app.use(function(req, res, next) {
  //  console.log('\x1b[90mDEBUG URL - %s\x1b[0m', req.url);
  //  next();
  //});

  app.use(cors({
    allowedOrigins: [
      '*:*'
    ]
  }));


  app.use(express.urlencoded());
  app.use(express.json());

  // Routing
  app.use(app.router);

  // development only
  if (app.get('env') == 'development') {
    app.use(express.errorHandler());
  }

  var node = require('../../controllers/node')(server);
  answerForGet('/node/summary',  node.summary);

  var blockchain = require('../../controllers/blockchain')(server);
  answerForGet( '/blockchain/parameters',       blockchain.parameters);
  answerForPost('/blockchain/membership',       blockchain.parseMembership);
  answerForGet( '/blockchain/memberships/:search', blockchain.memberships);
  answerForPost('/blockchain/block',            blockchain.parseBlock);
  answerForGet( '/blockchain/block/:number',    blockchain.promoted);
  answerForGet( '/blockchain/blocks/:count/:from',    blockchain.blocks);
  answerForGet( '/blockchain/current',          blockchain.current);
  answerForGet( '/blockchain/hardship/:search', blockchain.hardship);
  answerForGet( '/blockchain/with/newcomers',   blockchain.with.newcomers);
  answerForGet( '/blockchain/with/certs',       blockchain.with.certs);
  answerForGet( '/blockchain/with/joiners',     blockchain.with.joiners);
  answerForGet( '/blockchain/with/actives',     blockchain.with.actives);
  answerForGet( '/blockchain/with/leavers',     blockchain.with.leavers);
  answerForGet( '/blockchain/with/excluded',    blockchain.with.excluded);
  answerForGet( '/blockchain/with/ud',          blockchain.with.ud);
  answerForGet( '/blockchain/with/tx',          blockchain.with.tx);
  answerForGet( '/blockchain/branches',         blockchain.branches);

  var net = require('../../controllers/network')(server, server.conf);
  answerForGet( '/network/peering',             net.peer);
  answerForGet( '/network/peering/peers',       net.peersGet);
  answerForPost('/network/peering/peers',       net.peersPost);
  answerForGet('/network/peers',                net.peers);

  var wot = require('../../controllers/wot')(server);
  answerForPost('/wot/add',                   wot.add);
  answerForPost('/wot/revoke',                wot.revoke);
  answerForGet( '/wot/lookup/:search',        wot.lookup);
  answerForGet( '/wot/members',               wot.members);
  answerForGet( '/wot/requirements/:pubkey',  wot.requirements);
  answerForGet( '/wot/certifiers-of/:search', wot.certifiersOf);
  answerForGet( '/wot/certified-by/:search',  wot.certifiedBy);
  answerForGet( '/wot/identity-of/:search',   wot.identityOf);

  var transactions = require('../../controllers/transactions')(server);
  var dividend     = require('../../controllers/uds')(server);
  answerForPost('/tx/process',                           transactions.parseTransaction);
  answerForGet( '/tx/sources/:pubkey',                   transactions.getSources);
  answerForGet( '/tx/history/:pubkey',                   transactions.getHistory);
  answerForGet( '/tx/history/:pubkey/blocks/:from/:to',  transactions.getHistoryBetweenBlocks);
  answerForGet( '/tx/history/:pubkey/times/:from/:to',   transactions.getHistoryBetweenTimes);
  answerForGet( '/tx/history/:pubkey/pending',           transactions.getPendingForPubkey);
  answerForGet( '/tx/pending',                           transactions.getPending);
  answerForGet( '/ud/history/:pubkey',                   dividend.getHistory);
  answerForGet( '/ud/history/:pubkey/blocks/:from/:to',  dividend.getHistoryBetweenBlocks);
  answerForGet( '/ud/history/:pubkey/times/:from/:to',   dividend.getHistoryBetweenTimes);

  function answerForGet(uri, callback) {
    app.get(uri, function(req, res) {
      res.set('Access-Control-Allow-Origin', '*');
      callback(req, res);
    });
  }

  function answerForPost(uri, callback) {
    app.post(uri, function(req, res) {
      res.set('Access-Control-Allow-Origin', '*');
      callback(req, res);
    });
  }

  var httpServers = [];

  return co(function *() {
    for (let i = 0, len = interfaces.length; i < len; i++) {
      let netInterface = interfaces[i];
      try {
        let httpServer = yield listenInterface(app, netInterface.ip, netInterface.port);
        listenWebSocket(server, httpServer);
        httpServers.push(httpServer);
        logger.info('uCoin server listening on ' + netInterface.ip + ' port ' + netInterface.port);
      } catch (err) {
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
  });
};

function listenInterface(app, netInterface, port) {
  "use strict";
  return Q.Promise(function(resolve, reject){
    var httpServer = http.createServer(app);
    httpServer.on('error', reject);
    httpServer.on('listening', resolve.bind(this, httpServer));
    httpServer.listen(port, netInterface);
  });
}

function listenWebSocket(server, httpServer) {
  "use strict";
  var io = require('socket.io')(httpServer);
  var currentBlock = {};
  var blockSocket = io
    .of('/websocket/block')
    .on('error', (err) => logger.error(err))
    .on('connection', function (socket) {
      socket.emit('block', currentBlock);
    });
  var peerSocket = io
    .of('/websocket/peer');

  server
    .pipe(es.mapSync(function(data) {
      if (data.joiners) {
        currentBlock = data;
        blockSocket.emit('block', currentBlock);
      }
      if (data.endpoints) {
        peerSocket.emit('peer', data);
      }
    }));
}
