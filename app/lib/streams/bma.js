var http = require('http');
var express = require('express');
var async = require('async');
var log4js = require('log4js');
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
  answerForGet( '/blockchain/hardship/:pubkey', blockchain.hardship);
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

  var wot = require('../../controllers/wot')(server);
  answerForPost('/wot/add',                   wot.add);
  answerForPost('/wot/revoke',                wot.revoke);
  answerForGet( '/wot/lookup/:search',        wot.lookup);
  answerForGet( '/wot/members',               wot.members);
  answerForGet( '/wot/certifiers-of/:search', wot.certifiersOf);
  answerForGet( '/wot/certified-by/:search',  wot.certifiedBy);

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

  return interfaces.reduce(function(promise, netInterface) {
    return promise.then(function() {
      return listenInterface(app, netInterface.ip, netInterface.port)
        .then(function(httpServer){
          listenWebSocket(server, httpServer);
          logger.info('uCoin server listening on ' + netInterface.ip + ' port ' + netInterface.port);
        });
    });
  }, Q.resolve());
};

function listenInterface(app, netInterface, port) {
  "use strict";
  return Q.Promise(function(resolve, reject){
    var httpServer = http.createServer(app);
    httpServer.listen(port, netInterface, function(err){
      err ? reject(err) : resolve(httpServer);
    });
  });
}

function listenWebSocket(server, httpServer) {
  "use strict";
  var io = require('socket.io')(httpServer);
  var currentBlock = {};
  var blockSocket = io
    .of('/websocket/block')
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
