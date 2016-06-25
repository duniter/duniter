"use strict";

var co = require('co');
var es = require('event-stream');
var network = require('../system/network');
var dtos = require('./dtos');
var sanitize = require('./sanitize');

let WebSocketServer = require('ws').Server;

module.exports = function(server, interfaces, httpLogs) {

  if (!interfaces) {
    interfaces = [];
    if (server.conf) {
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
  }

  return network.createServersAndListen('Duniter server', interfaces, httpLogs, null, (app, httpMethods) => {

    var node         = require('../../controllers/node')(server);
    var blockchain   = require('../../controllers/blockchain')(server);
    var net          = require('../../controllers/network')(server, server.conf);
    var wot          = require('../../controllers/wot')(server);
    var transactions = require('../../controllers/transactions')(server);
    var dividend     = require('../../controllers/uds')(server);
    httpMethods.httpGET(  '/node/summary',                          node.summary,                         dtos.Summary);
    httpMethods.httpGET(  '/blockchain/parameters',                 blockchain.parameters,                dtos.Parameters);
    httpMethods.httpPOST( '/blockchain/membership',                 blockchain.parseMembership,           dtos.Membership);
    httpMethods.httpGET(  '/blockchain/memberships/:search',        blockchain.memberships,               dtos.Memberships);
    httpMethods.httpPOST( '/blockchain/block',                      blockchain.parseBlock,                dtos.Block);
    httpMethods.httpGET(  '/blockchain/block/:number',              blockchain.promoted,                  dtos.Block);
    httpMethods.httpGET(  '/blockchain/blocks/:count/:from',        blockchain.blocks,                    dtos.Blocks);
    httpMethods.httpGET(  '/blockchain/current',                    blockchain.current,                   dtos.Block);
    httpMethods.httpGET(  '/blockchain/hardship/:search',           blockchain.hardship,                  dtos.Hardship);
    httpMethods.httpGET(  '/blockchain/difficulties',               blockchain.difficulties,              dtos.Difficulties);
    httpMethods.httpGET(  '/blockchain/with/newcomers',             blockchain.with.newcomers,            dtos.Stat);
    httpMethods.httpGET(  '/blockchain/with/certs',                 blockchain.with.certs,                dtos.Stat);
    httpMethods.httpGET(  '/blockchain/with/joiners',               blockchain.with.joiners,              dtos.Stat);
    httpMethods.httpGET(  '/blockchain/with/actives',               blockchain.with.actives,              dtos.Stat);
    httpMethods.httpGET(  '/blockchain/with/leavers',               blockchain.with.leavers,              dtos.Stat);
    httpMethods.httpGET(  '/blockchain/with/excluded',              blockchain.with.excluded,             dtos.Stat);
    httpMethods.httpGET(  '/blockchain/with/revoked',               blockchain.with.revoked,              dtos.Stat);
    httpMethods.httpGET(  '/blockchain/with/ud',                    blockchain.with.ud,                   dtos.Stat);
    httpMethods.httpGET(  '/blockchain/with/tx',                    blockchain.with.tx,                   dtos.Stat);
    httpMethods.httpGET(  '/blockchain/branches',                   blockchain.branches,                  dtos.Branches);
    httpMethods.httpGET(  '/network/peering',                       net.peer,                             dtos.Peer);
    httpMethods.httpGET(  '/network/peering/peers',                 net.peersGet,                         dtos.MerkleOfPeers);
    httpMethods.httpPOST( '/network/peering/peers',                 net.peersPost,                        dtos.Peer);
    httpMethods.httpGET(  '/network/peers',                         net.peers,                            dtos.Peers);
    httpMethods.httpPOST( '/wot/add',                               wot.add,                              dtos.Identity);
    httpMethods.httpPOST( '/wot/certify',                           wot.certify,                          dtos.Cert);
    httpMethods.httpPOST( '/wot/revoke',                            wot.revoke,                           dtos.Result);
    httpMethods.httpGET(  '/wot/lookup/:search',                    wot.lookup,                           dtos.Lookup);
    httpMethods.httpGET(  '/wot/members',                           wot.members,                          dtos.Members);
    httpMethods.httpGET(  '/wot/requirements/:search',              wot.requirements,                     dtos.Requirements);
    httpMethods.httpGET(  '/wot/certifiers-of/:search',             wot.certifiersOf,                     dtos.Certifications);
    httpMethods.httpGET(  '/wot/certified-by/:search',              wot.certifiedBy,                      dtos.Certifications);
    httpMethods.httpGET(  '/wot/identity-of/:search',               wot.identityOf,                       dtos.SimpleIdentity);
    httpMethods.httpPOST( '/tx/process',                            transactions.parseTransaction,        dtos.Transaction);
    httpMethods.httpGET(  '/tx/sources/:pubkey',                    transactions.getSources,              dtos.Sources);
    httpMethods.httpGET(  '/tx/history/:pubkey',                    transactions.getHistory,              dtos.TxHistory);
    httpMethods.httpGET(  '/tx/history/:pubkey/blocks/:from/:to',   transactions.getHistoryBetweenBlocks, dtos.TxHistory);
    httpMethods.httpGET(  '/tx/history/:pubkey/times/:from/:to',    transactions.getHistoryBetweenTimes,  dtos.TxHistory);
    httpMethods.httpGET(  '/tx/history/:pubkey/pending',            transactions.getPendingForPubkey,     dtos.TxHistory);
    httpMethods.httpGET(  '/tx/pending',                            transactions.getPending,              dtos.TxPending);
    httpMethods.httpGET(  '/ud/history/:pubkey',                    dividend.getHistory,                  dtos.UDHistory);
    httpMethods.httpGET(  '/ud/history/:pubkey/blocks/:from/:to',   dividend.getHistoryBetweenBlocks,     dtos.UDHistory);
    httpMethods.httpGET(  '/ud/history/:pubkey/times/:from/:to',    dividend.getHistoryBetweenTimes,      dtos.UDHistory);

  }, (httpServer) => {

    let currentBlock = {};
    let wssBlock = new WebSocketServer({
      server: httpServer,
      path: '/ws/block'
    });
    let wssPeer = new WebSocketServer({
      server: httpServer,
      path: '/ws/peer'
    });

    wssBlock.on('connection', function connection(ws) {
      co(function *() {
        currentBlock = yield server.dal.getCurrentBlockOrNull();
        if (currentBlock) {
          ws.send(JSON.stringify(sanitize(currentBlock, dtos.Block)));
        }
      });
    });

    wssBlock.broadcast = (data) => wssBlock.clients.forEach((client) => client.send(data));
    wssPeer.broadcast = (data) => wssPeer.clients.forEach((client) => client.send(data));

    // Forward blocks & peers
    server
      .pipe(es.mapSync(function(data) {
        // Broadcast block
        if (data.joiners) {
          currentBlock = data;
          wssBlock.broadcast(JSON.stringify(sanitize(currentBlock, dtos.Block)));
        }
        // Broadcast peer
        if (data.endpoints) {
          wssPeer.broadcast(JSON.stringify(sanitize(data, dtos.Peer)));
        }
      }));
  });
};
