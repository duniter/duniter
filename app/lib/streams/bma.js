"use strict";

const co = require('co');
const es = require('event-stream');
const network = require('../system/network');
const dtos = require('./dtos');
const sanitize = require('./sanitize');
const limiter = require('../system/limiter');

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

    const node         = require('../../controllers/node')(server);
    const blockchain   = require('../../controllers/blockchain')(server);
    const net          = require('../../controllers/network')(server, server.conf);
    const wot          = require('../../controllers/wot')(server);
    const transactions = require('../../controllers/transactions')(server);
    const dividend     = require('../../controllers/uds')(server);
    httpMethods.httpGET(  '/node/summary',                          node.summary,                         dtos.Summary,        limiter.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/parameters',                 blockchain.parameters,                dtos.Parameters,     limiter.limitAsHighUsage());
    httpMethods.httpPOST( '/blockchain/membership',                 blockchain.parseMembership,           dtos.Membership,     limiter.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/memberships/:search',        blockchain.memberships,               dtos.Memberships,    limiter.limitAsHighUsage());
    httpMethods.httpPOST( '/blockchain/block',                      blockchain.parseBlock,                dtos.Block,          limiter.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/block/:number',              blockchain.promoted,                  dtos.Block,          limiter.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/blocks/:count/:from',        blockchain.blocks,                    dtos.Blocks,         limiter.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/current',                    blockchain.current,                   dtos.Block,          limiter.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/hardship/:search',           blockchain.hardship,                  dtos.Hardship,       limiter.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/difficulties',               blockchain.difficulties,              dtos.Difficulties,   limiter.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/with/newcomers',             blockchain.with.newcomers,            dtos.Stat,           limiter.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/with/certs',                 blockchain.with.certs,                dtos.Stat,           limiter.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/with/joiners',               blockchain.with.joiners,              dtos.Stat,           limiter.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/with/actives',               blockchain.with.actives,              dtos.Stat,           limiter.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/with/leavers',               blockchain.with.leavers,              dtos.Stat,           limiter.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/with/excluded',              blockchain.with.excluded,             dtos.Stat,           limiter.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/with/revoked',               blockchain.with.revoked,              dtos.Stat,           limiter.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/with/ud',                    blockchain.with.ud,                   dtos.Stat,           limiter.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/with/tx',                    blockchain.with.tx,                   dtos.Stat,           limiter.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/branches',                   blockchain.branches,                  dtos.Branches,       limiter.limitAsHighUsage());
    httpMethods.httpGET(  '/network/peering',                       net.peer,                             dtos.Peer,           limiter.limitAsHighUsage());
    httpMethods.httpGET(  '/network/peering/peers',                 net.peersGet,                         dtos.MerkleOfPeers,  limiter.limitAsHighUsage());
    httpMethods.httpPOST( '/network/peering/peers',                 net.peersPost,                        dtos.Peer,           limiter.limitAsHighUsage());
    httpMethods.httpGET(  '/network/peers',                         net.peers,                            dtos.Peers,          limiter.limitAsHighUsage());
    httpMethods.httpPOST( '/wot/add',                               wot.add,                              dtos.Identity,       limiter.limitAsHighUsage());
    httpMethods.httpPOST( '/wot/certify',                           wot.certify,                          dtos.Cert,           limiter.limitAsHighUsage());
    httpMethods.httpPOST( '/wot/revoke',                            wot.revoke,                           dtos.Result,         limiter.limitAsHighUsage());
    httpMethods.httpGET(  '/wot/lookup/:search',                    wot.lookup,                           dtos.Lookup,         limiter.limitAsHighUsage());
    httpMethods.httpGET(  '/wot/members',                           wot.members,                          dtos.Members,        limiter.limitAsHighUsage());
    httpMethods.httpGET(  '/wot/requirements/:search',              wot.requirements,                     dtos.Requirements,   limiter.limitAsHighUsage());
    httpMethods.httpGET(  '/wot/certifiers-of/:search',             wot.certifiersOf,                     dtos.Certifications, limiter.limitAsHighUsage());
    httpMethods.httpGET(  '/wot/certified-by/:search',              wot.certifiedBy,                      dtos.Certifications, limiter.limitAsHighUsage());
    httpMethods.httpGET(  '/wot/identity-of/:search',               wot.identityOf,                       dtos.SimpleIdentity, limiter.limitAsHighUsage());
    httpMethods.httpPOST( '/tx/process',                            transactions.parseTransaction,        dtos.Transaction,    limiter.limitAsHighUsage());
    httpMethods.httpGET(  '/tx/sources/:pubkey',                    transactions.getSources,              dtos.Sources,        limiter.limitAsHighUsage());
    httpMethods.httpGET(  '/tx/history/:pubkey',                    transactions.getHistory,              dtos.TxHistory,      limiter.limitAsHighUsage());
    httpMethods.httpGET(  '/tx/history/:pubkey/blocks/:from/:to',   transactions.getHistoryBetweenBlocks, dtos.TxHistory,      limiter.limitAsHighUsage());
    httpMethods.httpGET(  '/tx/history/:pubkey/times/:from/:to',    transactions.getHistoryBetweenTimes,  dtos.TxHistory,      limiter.limitAsHighUsage());
    httpMethods.httpGET(  '/tx/history/:pubkey/pending',            transactions.getPendingForPubkey,     dtos.TxHistory,      limiter.limitAsHighUsage());
    httpMethods.httpGET(  '/tx/pending',                            transactions.getPending,              dtos.TxPending,      limiter.limitAsHighUsage());
    httpMethods.httpGET(  '/ud/history/:pubkey',                    dividend.getHistory,                  dtos.UDHistory,      limiter.limitAsHighUsage());
    httpMethods.httpGET(  '/ud/history/:pubkey/blocks/:from/:to',   dividend.getHistoryBetweenBlocks,     dtos.UDHistory,      limiter.limitAsHighUsage());
    httpMethods.httpGET(  '/ud/history/:pubkey/times/:from/:to',    dividend.getHistoryBetweenTimes,      dtos.UDHistory,      limiter.limitAsHighUsage());

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
