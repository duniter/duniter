var _ = require('underscore');
var http = require('http');
var express = require('express');
var co = require('co');
var Q = require('q');
var cors = require('express-cors');
var es = require('event-stream');
var morgan = require('morgan');
var constants = require('../../lib/constants');
var dtos = require('../../lib/streams/dtos');
var sanitize = require('../../lib/sanitize');
var logger = require('../../lib/logger')('bma');

module.exports = function(server, interfaces, httpLogs) {

  "use strict";

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


  app.use(express.urlencoded());
  app.use(express.json());

  // Routing
  app.use(app.router);

  // development only
  if (app.get('env') == 'development') {
    app.use(express.errorHandler());
  }

  var node         = require('../../controllers/node')(server);
  var blockchain   = require('../../controllers/blockchain')(server);
  var net          = require('../../controllers/network')(server, server.conf);
  var wot          = require('../../controllers/wot')(server);
  var transactions = require('../../controllers/transactions')(server);
  var dividend     = require('../../controllers/uds')(server);
  answerForGetP(  '/node/summary',                          node.summary,                         dtos.Summary);
  answerForGetP(  '/blockchain/parameters',                 blockchain.parameters,                dtos.Parameters);
  answerForPostP( '/blockchain/membership',                 blockchain.parseMembership,           dtos.Membership);
  answerForGetP(  '/blockchain/memberships/:search',        blockchain.memberships,               dtos.Memberships);
  answerForPostP( '/blockchain/block',                      blockchain.parseBlock,                dtos.Block);
  answerForGetP(  '/blockchain/block/:number',              blockchain.promoted,                  dtos.Block);
  answerForGetP(  '/blockchain/blocks/:count/:from',        blockchain.blocks,                    dtos.Blocks);
  answerForGetP(  '/blockchain/current',                    blockchain.current,                   dtos.Block);
  answerForGetP(  '/blockchain/hardship/:search',           blockchain.hardship,                  dtos.Hardship);
  answerForGetP(  '/blockchain/difficulties',               blockchain.difficulties,              dtos.Difficulties);
  answerForGetP(  '/blockchain/with/newcomers',             blockchain.with.newcomers,            dtos.Stat);
  answerForGetP(  '/blockchain/with/certs',                 blockchain.with.certs,                dtos.Stat);
  answerForGetP(  '/blockchain/with/joiners',               blockchain.with.joiners,              dtos.Stat);
  answerForGetP(  '/blockchain/with/actives',               blockchain.with.actives,              dtos.Stat);
  answerForGetP(  '/blockchain/with/leavers',               blockchain.with.leavers,              dtos.Stat);
  answerForGetP(  '/blockchain/with/excluded',              blockchain.with.excluded,             dtos.Stat);
  answerForGetP(  '/blockchain/with/ud',                    blockchain.with.ud,                   dtos.Stat);
  answerForGetP(  '/blockchain/with/tx',                    blockchain.with.tx,                   dtos.Stat);
  answerForGetP(  '/blockchain/branches',                   blockchain.branches,                  dtos.Branches);
  answerForGetP(  '/network/peering',                       net.peer,                             dtos.Peer);
  answerForGetP(  '/network/peering/peers',                 net.peersGet,                         dtos.MerkleOfPeers);
  answerForPostP( '/network/peering/peers',                 net.peersPost,                        dtos.Peer);
  answerForGetP(  '/network/peers',                         net.peers,                            dtos.Peers);
  answerForPostP( '/wot/add',                               wot.add,                              dtos.Identity);
  answerForPostP( '/wot/revoke',                            wot.revoke,                           dtos.Result);
  answerForGetP(  '/wot/lookup/:search',                    wot.lookup,                           dtos.Lookup);
  answerForGetP(  '/wot/members',                           wot.members,                          dtos.Members);
  answerForGetP(  '/wot/requirements/:search',              wot.requirements,                     dtos.Requirements);
  answerForGetP(  '/wot/certifiers-of/:search',             wot.certifiersOf,                     dtos.Certifications);
  answerForGetP(  '/wot/certified-by/:search',              wot.certifiedBy,                      dtos.Certifications);
  answerForGetP(  '/wot/identity-of/:search',               wot.identityOf,                       dtos.SimpleIdentity);
  answerForPostP( '/tx/process',                            transactions.parseTransaction,        dtos.Transaction);
  answerForGetP(  '/tx/sources/:pubkey',                    transactions.getSources,              dtos.Sources);
  answerForGetP(  '/tx/history/:pubkey',                    transactions.getHistory,              dtos.TxHistory);
  answerForGetP(  '/tx/history/:pubkey/blocks/:from/:to',   transactions.getHistoryBetweenBlocks, dtos.TxHistory);
  answerForGetP(  '/tx/history/:pubkey/times/:from/:to',    transactions.getHistoryBetweenTimes,  dtos.TxHistory);
  answerForGetP(  '/tx/history/:pubkey/pending',            transactions.getPendingForPubkey,     dtos.TxHistory);
  answerForGetP(  '/tx/pending',                            transactions.getPending,              dtos.TxPending);
  answerForGetP(  '/ud/history/:pubkey',                    dividend.getHistory,                  dtos.UDHistory);
  answerForGetP(  '/ud/history/:pubkey/blocks/:from/:to',   dividend.getHistoryBetweenBlocks,     dtos.UDHistory);
  answerForGetP(  '/ud/history/:pubkey/times/:from/:to',    dividend.getHistoryBetweenTimes,      dtos.UDHistory);

  function answerForGetP(uri, promiseFunc, dtoContract) {
    handleRequest(app.get.bind(app), uri, promiseFunc, dtoContract);
  }

  function answerForPostP(uri, promiseFunc, dtoContract) {
    handleRequest(app.post.bind(app), uri, promiseFunc, dtoContract);
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
          res.send(200, JSON.stringify(result, null, "  "));
        } catch (e) {
          let error = getResultingError(e);
          // HTTP error
          res.send(error.httpCode, JSON.stringify(error.uerr, null, "  "));
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
