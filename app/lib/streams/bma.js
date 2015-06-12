var http = require('http');
var express = require('express');
var async = require('async');
var log4js = require('log4js');
var Q = require('q');

var logger = require('../../lib/logger')('bma');

module.exports = function(ucoinNode, interfaces, httpLogs) {

  "use strict";

  var httpLogger  = log4js.getLogger();
  var app = express();

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
  app.use(express.urlencoded());
  app.use(express.json());

  // Routing
  app.use(app.router);

  // development only
  if (app.get('env') == 'development') {
    app.use(express.errorHandler());
  }

  var node = require('../../controllers/node')(ucoinNode);
  app.get('/node/summary',  node.summary);

  var blockchain = require('../../controllers/blockchain')(ucoinNode);
  app.get( '/blockchain/parameters',       blockchain.parameters);
  app.post('/blockchain/membership',       blockchain.parseMembership);
  app.get( '/blockchain/memberships/:search', blockchain.memberships);
  app.post('/blockchain/block',            blockchain.parseBlock);
  app.get( '/blockchain/block/:number',    blockchain.promoted);
  app.get( '/blockchain/blocks/:count/:from',    blockchain.blocks);
  app.get( '/blockchain/current',          blockchain.current);
  app.get( '/blockchain/hardship/:pubkey', blockchain.hardship);
  app.get( '/blockchain/with/newcomers',   blockchain.with.newcomers);
  app.get( '/blockchain/with/certs',       blockchain.with.certs);
  app.get( '/blockchain/with/joiners',     blockchain.with.joiners);
  app.get( '/blockchain/with/actives',     blockchain.with.actives);
  app.get( '/blockchain/with/leavers',     blockchain.with.leavers);
  app.get( '/blockchain/with/excluded',    blockchain.with.excluded);
  app.get( '/blockchain/with/ud',          blockchain.with.ud);
  app.get( '/blockchain/with/tx',          blockchain.with.tx);

  var net = require('../../controllers/network')(ucoinNode, ucoinNode.conf);
  app.get( '/network/peering',             net.peer);
  app.get( '/network/peering/peers',       net.peersGet);
  app.post('/network/peering/peers',       net.peersPost);

  var wot = require('../../controllers/wot')(ucoinNode);
  app.post('/wot/add',                   wot.add);
  app.post('/wot/revoke',                wot.revoke);
  app.get( '/wot/lookup/:search',        wot.lookup);
  app.get( '/wot/members',               wot.members);
  app.get( '/wot/certifiers-of/:search', wot.certifiersOf);
  app.get( '/wot/certified-by/:search',  wot.certifiedBy);

  var transactions = require('../../controllers/transactions')(ucoinNode);
  var dividend     = require('../../controllers/uds')(ucoinNode);
  app.post('/tx/process',                           transactions.parseTransaction);
  app.get( '/tx/sources/:pubkey',                   transactions.getSources);
  app.get( '/tx/history/:pubkey',                   transactions.getHistory);
  app.get( '/tx/history/:pubkey/blocks/:from/:to',  transactions.getHistoryBetweenBlocks);
  app.get( '/tx/history/:pubkey/times/:from/:to',   transactions.getHistoryBetweenTimes);
  app.get( '/tx/history/:pubkey/pending',           transactions.getPendingForPubkey);
  app.get( '/tx/pending',                           transactions.getPending);
  app.get( '/ud/history/:pubkey',                   dividend.getHistory);

  return interfaces.reduce(function(promise, netInterface) {
    return promise.then(function() {
      return listenInterface(app, netInterface.ip, netInterface.port)
        .then(function(){
          logger.info('uCoin server listening on ' + netInterface.ip + ' port ' + netInterface.port);
        });
    });
  }, Q.resolve());
};

function listenInterface(app, netInterface, port) {
  "use strict";
  return Q.Promise(function(resolve, reject){
    var server = http.createServer(app);
    server.listen(port, netInterface, function(err){
      err ? reject(err) : resolve();
    });
  });
}