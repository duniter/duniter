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
    httpMethods.httpGET(  '/',                                      (req:any) => node.summary(),                            dtos.Summary,        BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/node/summary',                          (req:any) => node.summary(),                            dtos.Summary,        BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/node/sandboxes',                        (req:any) => node.sandboxes(),                          dtos.Sandboxes,      BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/parameters',                 (req:any) => blockchain.parameters(),                   dtos.Parameters,     BMALimitation.limitAsHighUsage());
    httpMethods.httpPOST( '/blockchain/membership',                 (req:any) => blockchain.parseMembership(req),           dtos.Membership,     BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/memberships/:search',        (req:any) => blockchain.memberships(req),               dtos.Memberships,    BMALimitation.limitAsHighUsage());
    httpMethods.httpPOST( '/blockchain/block',                      (req:any) => blockchain.parseBlock(req),                dtos.Block,          BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/block/:number',              (req:any) => blockchain.promoted(req),                  dtos.Block,          BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/blocks/:count/:from',        (req:any) => blockchain.blocks(req),                    dtos.Blocks,         BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/current',                    (req:any) => blockchain.current(),                      dtos.Block,          BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/hardship/:search',           (req:any) => blockchain.hardship(req),                  dtos.Hardship,       BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/difficulties',               (req:any) => blockchain.difficulties(),                 dtos.Difficulties,   BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/with/newcomers',             (req:any) => blockchain.with.newcomers(req),            dtos.Stat,           BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/with/certs',                 (req:any) => blockchain.with.certs(req),                dtos.Stat,           BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/with/joiners',               (req:any) => blockchain.with.joiners(req),              dtos.Stat,           BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/with/actives',               (req:any) => blockchain.with.actives(req),              dtos.Stat,           BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/with/leavers',               (req:any) => blockchain.with.leavers(req),              dtos.Stat,           BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/with/excluded',              (req:any) => blockchain.with.excluded(req),             dtos.Stat,           BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/with/revoked',               (req:any) => blockchain.with.revoked(req),              dtos.Stat,           BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/with/ud',                    (req:any) => blockchain.with.ud(req),                   dtos.Stat,           BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/with/tx',                    (req:any) => blockchain.with.tx(req),                   dtos.Stat,           BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/branches',                   (req:any) => blockchain.branches(),                     dtos.Branches,       BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/network/peering',                       (req:any) => net.peer(),                                dtos.Peer,           BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/network/peering/peers',                 (req:any) => net.peersGet(req),                         dtos.MerkleOfPeers,  BMALimitation.limitAsVeryHighUsage());
    httpMethods.httpPOST( '/network/peering/peers',                 (req:any) => net.peersPost(req),                        dtos.Peer,           BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/network/peers',                         (req:any) => net.peers(),                               dtos.Peers,          BMALimitation.limitAsHighUsage());
    httpMethods.httpPOST( '/wot/add',                               (req:any) => wot.add(req),                              dtos.Identity,       BMALimitation.limitAsHighUsage());
    httpMethods.httpPOST( '/wot/certify',                           (req:any) => wot.certify(req),                          dtos.Cert,           BMALimitation.limitAsHighUsage());
    httpMethods.httpPOST( '/wot/revoke',                            (req:any) => wot.revoke(req),                           dtos.Result,         BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/wot/lookup/:search',                    (req:any) => wot.lookup(req),                           dtos.Lookup,         BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/wot/members',                           (req:any) => wot.members(),                             dtos.Members,        BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/wot/pending',                           (req:any) => wot.pendingMemberships(),                  dtos.MembershipList, BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/wot/requirements/:search',              (req:any) => wot.requirements(req),                     dtos.Requirements,   BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/wot/requirements-of-pending/:minsig',   (req:any) => wot.requirementsOfPending(req),            dtos.Requirements,   BMALimitation.limitAsLowUsage());
    httpMethods.httpGET(  '/wot/certifiers-of/:search',             (req:any) => wot.certifiersOf(req),                     dtos.Certifications, BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/wot/certified-by/:search',              (req:any) => wot.certifiedBy(req),                      dtos.Certifications, BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/wot/identity-of/:search',               (req:any) => wot.identityOf(req),                       dtos.SimpleIdentity, BMALimitation.limitAsHighUsage());
    httpMethods.httpPOST( '/tx/process',                            (req:any) => transactions.parseTransaction(req),        dtos.Transaction,    BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/tx/hash/:hash',                         (req:any) => transactions.getByHash(req),               dtos.Transaction,    BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/tx/sources/:pubkey',                    (req:any) => transactions.getSources(req),              dtos.Sources,        BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/tx/history/:pubkey',                    (req:any) => transactions.getHistory(req),              dtos.TxHistory,      BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/tx/history/:pubkey/blocks/:from/:to',   (req:any) => transactions.getHistoryBetweenBlocks(req), dtos.TxHistory,      BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/tx/history/:pubkey/times/:from/:to',    (req:any) => transactions.getHistoryBetweenTimes(req),  dtos.TxHistory,      BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/tx/history/:pubkey/pending',            (req:any) => transactions.getPendingForPubkey(req),     dtos.TxHistory,      BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/tx/pending',                            (req:any) => transactions.getPending(),                 dtos.TxPending,      BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/ud/history/:pubkey',                    (req:any) => dividend.getHistory(req),                  dtos.UDHistory,      BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/ud/history/:pubkey/blocks/:from/:to',   (req:any) => dividend.getHistoryBetweenBlocks(req),     dtos.UDHistory,      BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/ud/history/:pubkey/times/:from/:to',    (req:any) => dividend.getHistoryBetweenTimes(req),      dtos.UDHistory,      BMALimitation.limitAsHighUsage());

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
