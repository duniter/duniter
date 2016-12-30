"use strict";

const co = require('co');
const es = require('event-stream');
const dtos = require('./dtos');
const sanitize = require('./sanitize');
const limiter = require('../system/limiter');
const constants = require('../../lib/constants');
const logger = require('../logger')('routes');

const WebSocketServer = require('ws').Server;

module.exports = {

  bma: function(server, prefix, app, httpMethods) {

    const node         = require('../../controllers/node')(server);
    const blockchain   = require('../../controllers/blockchain')(server);
    const net          = require('../../controllers/network')(server, server.conf);
    const wot          = require('../../controllers/wot')(server);
    const transactions = require('../../controllers/transactions')(server);
    const dividend     = require('../../controllers/uds')(server);
    httpMethods.httpGET(  prefix + '/',                                      node.summary,                         dtos.Summary,        limiter.limitAsHighUsage());
    httpMethods.httpGET(  prefix + '/node/summary',                          node.summary,                         dtos.Summary,        limiter.limitAsHighUsage());
    httpMethods.httpGET(  prefix + '/node/sandboxes',                        node.sandboxes,                       dtos.Sandboxes,      limiter.limitAsHighUsage());
    httpMethods.httpGET(  prefix + '/blockchain/parameters',                 blockchain.parameters,                dtos.Parameters,     limiter.limitAsHighUsage());
    httpMethods.httpPOST( prefix + '/blockchain/membership',                 blockchain.parseMembership,           dtos.Membership,     limiter.limitAsHighUsage());
    httpMethods.httpGET(  prefix + '/blockchain/memberships/:search',        blockchain.memberships,               dtos.Memberships,    limiter.limitAsHighUsage());
    httpMethods.httpPOST( prefix + '/blockchain/block',                      blockchain.parseBlock,                dtos.Block,          limiter.limitAsHighUsage());
    httpMethods.httpGET(  prefix + '/blockchain/block/:number',              blockchain.promoted,                  dtos.Block,          limiter.limitAsHighUsage());
    httpMethods.httpGET(  prefix + '/blockchain/blocks/:count/:from',        blockchain.blocks,                    dtos.Blocks,         limiter.limitAsHighUsage());
    httpMethods.httpGET(  prefix + '/blockchain/current',                    blockchain.current,                   dtos.Block,          limiter.limitAsHighUsage());
    httpMethods.httpGET(  prefix + '/blockchain/hardship/:search',           blockchain.hardship,                  dtos.Hardship,       limiter.limitAsHighUsage());
    httpMethods.httpGET(  prefix + '/blockchain/difficulties',               blockchain.difficulties,              dtos.Difficulties,   limiter.limitAsHighUsage());
    httpMethods.httpGET(  prefix + '/blockchain/with/newcomers',             blockchain.with.newcomers,            dtos.Stat,           limiter.limitAsHighUsage());
    httpMethods.httpGET(  prefix + '/blockchain/with/certs',                 blockchain.with.certs,                dtos.Stat,           limiter.limitAsHighUsage());
    httpMethods.httpGET(  prefix + '/blockchain/with/joiners',               blockchain.with.joiners,              dtos.Stat,           limiter.limitAsHighUsage());
    httpMethods.httpGET(  prefix + '/blockchain/with/actives',               blockchain.with.actives,              dtos.Stat,           limiter.limitAsHighUsage());
    httpMethods.httpGET(  prefix + '/blockchain/with/leavers',               blockchain.with.leavers,              dtos.Stat,           limiter.limitAsHighUsage());
    httpMethods.httpGET(  prefix + '/blockchain/with/excluded',              blockchain.with.excluded,             dtos.Stat,           limiter.limitAsHighUsage());
    httpMethods.httpGET(  prefix + '/blockchain/with/revoked',               blockchain.with.revoked,              dtos.Stat,           limiter.limitAsHighUsage());
    httpMethods.httpGET(  prefix + '/blockchain/with/ud',                    blockchain.with.ud,                   dtos.Stat,           limiter.limitAsHighUsage());
    httpMethods.httpGET(  prefix + '/blockchain/with/tx',                    blockchain.with.tx,                   dtos.Stat,           limiter.limitAsHighUsage());
    httpMethods.httpGET(  prefix + '/blockchain/branches',                   blockchain.branches,                  dtos.Branches,       limiter.limitAsHighUsage());
    httpMethods.httpGET(  prefix + '/network/peering',                       net.peer,                             dtos.Peer,           limiter.limitAsHighUsage());
    httpMethods.httpGET(  prefix + '/network/peering/peers',                 net.peersGet,                         dtos.MerkleOfPeers,  limiter.limitAsVeryHighUsage());
    httpMethods.httpPOST( prefix + '/network/peering/peers',                 net.peersPost,                        dtos.Peer,           limiter.limitAsHighUsage());
    httpMethods.httpGET(  prefix + '/network/peers',                         net.peers,                            dtos.Peers,          limiter.limitAsHighUsage());
    httpMethods.httpPOST( prefix + '/wot/add',                               wot.add,                              dtos.Identity,       limiter.limitAsHighUsage());
    httpMethods.httpPOST( prefix + '/wot/certify',                           wot.certify,                          dtos.Cert,           limiter.limitAsHighUsage());
    httpMethods.httpPOST( prefix + '/wot/revoke',                            wot.revoke,                           dtos.Result,         limiter.limitAsHighUsage());
    httpMethods.httpGET(  prefix + '/wot/lookup/:search',                    wot.lookup,                           dtos.Lookup,         limiter.limitAsHighUsage());
    httpMethods.httpGET(  prefix + '/wot/members',                           wot.members,                          dtos.Members,        limiter.limitAsHighUsage());
    httpMethods.httpGET(  prefix + '/wot/pending',                           wot.pendingMemberships,               dtos.MembershipList, limiter.limitAsHighUsage());
    httpMethods.httpGET(  prefix + '/wot/requirements/:search',              wot.requirements,                     dtos.Requirements,   limiter.limitAsHighUsage());
    httpMethods.httpGET(  prefix + '/wot/certifiers-of/:search',             wot.certifiersOf,                     dtos.Certifications, limiter.limitAsHighUsage());
    httpMethods.httpGET(  prefix + '/wot/certified-by/:search',              wot.certifiedBy,                      dtos.Certifications, limiter.limitAsHighUsage());
    httpMethods.httpGET(  prefix + '/wot/identity-of/:search',               wot.identityOf,                       dtos.SimpleIdentity, limiter.limitAsHighUsage());
    httpMethods.httpPOST( prefix + '/tx/process',                            transactions.parseTransaction,        dtos.Transaction,    limiter.limitAsHighUsage());
    httpMethods.httpGET(  prefix + '/tx/sources/:pubkey',                    transactions.getSources,              dtos.Sources,        limiter.limitAsHighUsage());
    httpMethods.httpGET(  prefix + '/tx/history/:pubkey',                    transactions.getHistory,              dtos.TxHistory,      limiter.limitAsHighUsage());
    httpMethods.httpGET(  prefix + '/tx/history/:pubkey/blocks/:from/:to',   transactions.getHistoryBetweenBlocks, dtos.TxHistory,      limiter.limitAsHighUsage());
    httpMethods.httpGET(  prefix + '/tx/history/:pubkey/times/:from/:to',    transactions.getHistoryBetweenTimes,  dtos.TxHistory,      limiter.limitAsHighUsage());
    httpMethods.httpGET(  prefix + '/tx/history/:pubkey/pending',            transactions.getPendingForPubkey,     dtos.TxHistory,      limiter.limitAsHighUsage());
    httpMethods.httpGET(  prefix + '/tx/pending',                            transactions.getPending,              dtos.TxPending,      limiter.limitAsHighUsage());
    httpMethods.httpGET(  prefix + '/ud/history/:pubkey',                    dividend.getHistory,                  dtos.UDHistory,      limiter.limitAsHighUsage());
    httpMethods.httpGET(  prefix + '/ud/history/:pubkey/blocks/:from/:to',   dividend.getHistoryBetweenBlocks,     dtos.UDHistory,      limiter.limitAsHighUsage());
    httpMethods.httpGET(  prefix + '/ud/history/:pubkey/times/:from/:to',    dividend.getHistoryBetweenTimes,      dtos.UDHistory,      limiter.limitAsHighUsage());
  },
  
  bmaWS: function(server, prefix) {
    return (httpServer) => {

      let currentBlock = {};
      let wssBlock = new WebSocketServer({
        server: httpServer,
        path: prefix + '/ws/block'
      });
      let wssPeer = new WebSocketServer({
        server: httpServer,
        path: prefix + '/ws/peer'
      });

      wssBlock.on('error', function (error) {
        logger.error('Error on WS Server');
        logger.error(error);
      });

      wssBlock.on('connection', function connection(ws) {
        co(function *() {
          currentBlock = yield server.dal.getCurrentBlockOrNull();
          if (currentBlock) {
            ws.send(JSON.stringify(sanitize(currentBlock, dtos.Block)));
          }
        });
      });

      wssBlock.broadcast = (data) => wssBlock.clients.forEach((client) => {
        try {
          client.send(data);
        } catch (e) {
          logger.error('error on ws: %s', e);
        }
      });
      wssPeer.broadcast = (data) => wssPeer.clients.forEach((client) => client.send(data));

      // Forward blocks & peers
      server
        .pipe(es.mapSync(function(data) {
          try {
            // Broadcast block
            if (data.joiners) {
              currentBlock = data;
              wssBlock.broadcast(JSON.stringify(sanitize(currentBlock, dtos.Block)));
            }
            // Broadcast peer
            if (data.endpoints) {
              wssPeer.broadcast(JSON.stringify(sanitize(data, dtos.Peer)));
            }
          } catch (e) {
            logger.error('error on ws mapSync:', e);
          }
        }));
    };
  }
};
