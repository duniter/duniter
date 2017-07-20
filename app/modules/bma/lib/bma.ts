"use strict";
import {Server} from "../../../../server"
import {Network, NetworkInterface} from "./network"
import * as dtos from "./dtos"
import {BMALimitation} from "./limiter"
import {BlockchainBinding} from "./controllers/blockchain"
import {NodeBinding} from "./controllers/node"
import {NetworkBinding} from "./controllers/network"
import {WOTBinding} from "./controllers/wot"
import {TransactionBinding} from "./controllers/transactions"
import {UDBinding} from "./controllers/uds"

const co = require('co');
const es = require('event-stream');
const sanitize = require('./sanitize');
const WebSocketServer = require('ws').Server;

export const bma = function(server:Server, interfaces:NetworkInterface[], httpLogs:boolean, logger:any) {

  if (!interfaces) {
    interfaces = [];
    if (server.conf) {
      if (server.conf.ipv4) {
        interfaces = [{
          ip: server.conf.ipv4,
          port: server.conf.port
        }];
      }
      if (server.conf.ipv6) {
        interfaces.push({
          ip: server.conf.ipv6,
          port: (server.conf.remoteport || server.conf.port) // We try to get the best one
        });
      }
    }
  }

  return Network.createServersAndListen('Duniter server', server, interfaces, httpLogs, logger, null, (app:any, httpMethods:any) => {

    const node         = new NodeBinding(server);
    const blockchain   = new BlockchainBinding(server)
    const net          = new NetworkBinding(server)
    const wot          = new WOTBinding(server)
    const transactions = new TransactionBinding(server)
    const dividend     = new UDBinding(server)
    httpMethods.httpGET(  '/',                                      node.summary,                         dtos.Summary,        BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/node/summary',                          node.summary,                         dtos.Summary,        BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/node/sandboxes',                        node.sandboxes,                       dtos.Sandboxes,      BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/parameters',                 blockchain.parameters,                dtos.Parameters,     BMALimitation.limitAsHighUsage());
    httpMethods.httpPOST( '/blockchain/membership',                 blockchain.parseMembership,           dtos.Membership,     BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/memberships/:search',        blockchain.memberships,               dtos.Memberships,    BMALimitation.limitAsHighUsage());
    httpMethods.httpPOST( '/blockchain/block',                      blockchain.parseBlock,                dtos.Block,          BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/block/:number',              blockchain.promoted,                  dtos.Block,          BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/blocks/:count/:from',        blockchain.blocks,                    dtos.Blocks,         BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/current',                    blockchain.current,                   dtos.Block,          BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/hardship/:search',           blockchain.hardship,                  dtos.Hardship,       BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/difficulties',               blockchain.difficulties,              dtos.Difficulties,   BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/with/newcomers',             blockchain.with.newcomers,            dtos.Stat,           BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/with/certs',                 blockchain.with.certs,                dtos.Stat,           BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/with/joiners',               blockchain.with.joiners,              dtos.Stat,           BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/with/actives',               blockchain.with.actives,              dtos.Stat,           BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/with/leavers',               blockchain.with.leavers,              dtos.Stat,           BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/with/excluded',              blockchain.with.excluded,             dtos.Stat,           BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/with/revoked',               blockchain.with.revoked,              dtos.Stat,           BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/with/ud',                    blockchain.with.ud,                   dtos.Stat,           BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/with/tx',                    blockchain.with.tx,                   dtos.Stat,           BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/branches',                   blockchain.branches,                  dtos.Branches,       BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/network/peering',                       net.peer,                             dtos.Peer,           BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/network/peering/peers',                 net.peersGet,                         dtos.MerkleOfPeers,  BMALimitation.limitAsVeryHighUsage());
    httpMethods.httpPOST( '/network/peering/peers',                 net.peersPost,                        dtos.Peer,           BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/network/peers',                         net.peers,                            dtos.Peers,          BMALimitation.limitAsHighUsage());
    httpMethods.httpPOST( '/wot/add',                               wot.add,                              dtos.Identity,       BMALimitation.limitAsHighUsage());
    httpMethods.httpPOST( '/wot/certify',                           wot.certify,                          dtos.Cert,           BMALimitation.limitAsHighUsage());
    httpMethods.httpPOST( '/wot/revoke',                            wot.revoke,                           dtos.Result,         BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/wot/lookup/:search',                    wot.lookup,                           dtos.Lookup,         BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/wot/members',                           wot.members,                          dtos.Members,        BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/wot/pending',                           wot.pendingMemberships,               dtos.MembershipList, BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/wot/requirements/:search',              wot.requirements,                     dtos.Requirements,   BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/wot/requirements-of-pending/:minsig',   wot.requirementsOfPending,            dtos.Requirements,   BMALimitation.limitAsLowUsage());
    httpMethods.httpGET(  '/wot/certifiers-of/:search',             wot.certifiersOf,                     dtos.Certifications, BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/wot/certified-by/:search',              wot.certifiedBy,                      dtos.Certifications, BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/wot/identity-of/:search',               wot.identityOf,                       dtos.SimpleIdentity, BMALimitation.limitAsHighUsage());
    httpMethods.httpPOST( '/tx/process',                            transactions.parseTransaction,        dtos.Transaction,    BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/tx/hash/:hash',                         transactions.getByHash,               dtos.Transaction,    BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/tx/sources/:pubkey',                    transactions.getSources,              dtos.Sources,        BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/tx/history/:pubkey',                    transactions.getHistory,              dtos.TxHistory,      BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/tx/history/:pubkey/blocks/:from/:to',   transactions.getHistoryBetweenBlocks, dtos.TxHistory,      BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/tx/history/:pubkey/times/:from/:to',    transactions.getHistoryBetweenTimes,  dtos.TxHistory,      BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/tx/history/:pubkey/pending',            transactions.getPendingForPubkey,     dtos.TxHistory,      BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/tx/pending',                            transactions.getPending,              dtos.TxPending,      BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/ud/history/:pubkey',                    dividend.getHistory,                  dtos.UDHistory,      BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/ud/history/:pubkey/blocks/:from/:to',   dividend.getHistoryBetweenBlocks,     dtos.UDHistory,      BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/ud/history/:pubkey/times/:from/:to',    dividend.getHistoryBetweenTimes,      dtos.UDHistory,      BMALimitation.limitAsHighUsage());

  }, (httpServer:any) => {

    let currentBlock = {};
    let wssBlock = new WebSocketServer({
      server: httpServer,
      path: '/ws/block'
    });
    let wssPeer = new WebSocketServer({
      server: httpServer,
      path: '/ws/peer'
    });

    wssBlock.on('error', function (error:any) {
      logger && logger.error('Error on WS Server');
      logger && logger.error(error);
    });

    wssBlock.on('connection', function connection(ws:any) {
      co(function *() {
        try {
          currentBlock = yield server.dal.getCurrentBlockOrNull();
          if (currentBlock) {
            ws.send(JSON.stringify(sanitize(currentBlock, dtos.Block)));
          }
        } catch (e) {
          logger.error(e);
        }
      });
    });

    wssBlock.broadcast = (data:any) => wssBlock.clients.forEach((client:any) => {
      try {
        client.send(data);
      } catch (e) {
        logger && logger.error('error on ws: %s', e);
      }
    });
    wssPeer.broadcast = (data:any) => wssPeer.clients.forEach((client:any) => client.send(data));

    // Forward blocks & peers
    server
      .pipe(es.mapSync(function(data:any) {
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
          logger && logger.error('error on ws mapSync:', e);
        }
      }));
  });
};
