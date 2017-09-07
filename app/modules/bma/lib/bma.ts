import {Server} from "../../../../server"
import {BmaApi, Network, NetworkInterface} from "./network"
import {block2HttpBlock, HttpPeer} from "./dtos"
import {BMALimitation} from "./limiter"
import {BlockchainBinding} from "./controllers/blockchain"
import {NodeBinding} from "./controllers/node"
import {NetworkBinding} from "./controllers/network"
import {WOTBinding} from "./controllers/wot"
import {TransactionBinding} from "./controllers/transactions"
import {UDBinding} from "./controllers/uds"
import {PeerDTO} from "../../../lib/dto/PeerDTO"
import {BlockDTO} from "../../../lib/dto/BlockDTO"
import {OtherConstants} from "../../../lib/other_constants"

const co = require('co');
const es = require('event-stream');
const WebSocketServer = require('ws').Server;

export const bma = function(server:Server, interfaces:NetworkInterface[], httpLogs:boolean, logger:any): Promise<BmaApi> {

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
    httpMethods.httpGET(  '/',                                      (req:any) => node.summary(),                            BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/node/summary',                          (req:any) => node.summary(),                            BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/node/sandboxes',                        (req:any) => node.sandboxes(),                          BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/parameters',                 (req:any) => blockchain.parameters(),                   BMALimitation.limitAsHighUsage());
    httpMethods.httpPOST( '/blockchain/membership',                 (req:any) => blockchain.parseMembership(req),           BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/memberships/:search',        (req:any) => blockchain.memberships(req),               BMALimitation.limitAsHighUsage());
    httpMethods.httpPOST( '/blockchain/block',                      (req:any) => blockchain.parseBlock(req),                BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/block/:number',              (req:any) => blockchain.promoted(req),                  BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/blocks/:count/:from',        (req:any) => blockchain.blocks(req),                    BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/current',                    (req:any) => blockchain.current(),                      BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/hardship/:search',           (req:any) => blockchain.hardship(req),                  BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/difficulties',               (req:any) => blockchain.difficulties(),                 BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/with/newcomers',             (req:any) => blockchain.with.newcomers(req),            BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/with/certs',                 (req:any) => blockchain.with.certs(req),                BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/with/joiners',               (req:any) => blockchain.with.joiners(req),              BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/with/actives',               (req:any) => blockchain.with.actives(req),              BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/with/leavers',               (req:any) => blockchain.with.leavers(req),              BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/with/excluded',              (req:any) => blockchain.with.excluded(req),             BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/with/revoked',               (req:any) => blockchain.with.revoked(req),              BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/with/ud',                    (req:any) => blockchain.with.ud(req),                   BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/with/tx',                    (req:any) => blockchain.with.tx(req),                   BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/blockchain/branches',                   (req:any) => blockchain.branches(),                     BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/network/peering',                       (req:any) => net.peer(),                                BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/network/peering/peers',                 (req:any) => net.peersGet(req),                         BMALimitation.limitAsVeryHighUsage());
    httpMethods.httpPOST( '/network/peering/peers',                 (req:any) => net.peersPost(req),                        BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/network/peers',                         (req:any) => net.peers(),                               BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/network/ws2p/info',                     (req:any) => net.ws2pInfo(),                            BMALimitation.limitAsHighUsage());
    httpMethods.httpPOST( '/wot/add',                               (req:any) => wot.add(req),                              BMALimitation.limitAsHighUsage());
    httpMethods.httpPOST( '/wot/certify',                           (req:any) => wot.certify(req),                          BMALimitation.limitAsHighUsage());
    httpMethods.httpPOST( '/wot/revoke',                            (req:any) => wot.revoke(req),                           BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/wot/lookup/:search',                    (req:any) => wot.lookup(req),                           BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/wot/members',                           (req:any) => wot.members(),                             BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/wot/pending',                           (req:any) => wot.pendingMemberships(),                  BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/wot/requirements/:search',              (req:any) => wot.requirements(req),                     BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/wot/requirements-of-pending/:minsig',   (req:any) => wot.requirementsOfPending(req),            BMALimitation.limitAsLowUsage());
    httpMethods.httpGET(  '/wot/certifiers-of/:search',             (req:any) => wot.certifiersOf(req),                     BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/wot/certified-by/:search',              (req:any) => wot.certifiedBy(req),                      BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/wot/identity-of/:search',               (req:any) => wot.identityOf(req),                       BMALimitation.limitAsHighUsage());
    httpMethods.httpPOST( '/tx/process',                            (req:any) => transactions.parseTransaction(req),        BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/tx/hash/:hash',                         (req:any) => transactions.getByHash(req),               BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/tx/sources/:pubkey',                    (req:any) => transactions.getSources(req),              BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/tx/history/:pubkey',                    (req:any) => transactions.getHistory(req),              BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/tx/history/:pubkey/blocks/:from/:to',   (req:any) => transactions.getHistoryBetweenBlocks(req), BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/tx/history/:pubkey/times/:from/:to',    (req:any) => transactions.getHistoryBetweenTimes(req),  BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/tx/history/:pubkey/pending',            (req:any) => transactions.getPendingForPubkey(req),     BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/tx/pending',                            (req:any) => transactions.getPending(),                 BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/ud/history/:pubkey',                    (req:any) => dividend.getHistory(req),                  BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/ud/history/:pubkey/blocks/:from/:to',   (req:any) => dividend.getHistoryBetweenBlocks(req),     BMALimitation.limitAsHighUsage());
    httpMethods.httpGET(  '/ud/history/:pubkey/times/:from/:to',    (req:any) => dividend.getHistoryBetweenTimes(req),      BMALimitation.limitAsHighUsage());

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
            const blockDTO:BlockDTO = BlockDTO.fromJSONObject(currentBlock)
            ws.send(JSON.stringify(block2HttpBlock(blockDTO)))
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

    // Forward current HEAD change
    server
      .on('bcEvent', (e) => {
        if (e.bcEvent === OtherConstants.BC_EVENT.HEAD_CHANGED || e.bcEvent === OtherConstants.BC_EVENT.SWITCHED) {
          try {
            // Broadcast block
            currentBlock = e.block;
            const blockDTO:BlockDTO = BlockDTO.fromJSONObject(currentBlock)
            wssBlock.broadcast(JSON.stringify(block2HttpBlock(blockDTO)))
          } catch (e) {
            logger && logger.error('error on ws mapSync:', e);
          }
        }
      })
    // Forward peers documents
    server
      .pipe(es.mapSync(function(data:any) {
        try {
          // Broadcast peer
          if (data.endpoints) {
            const peerDTO = PeerDTO.fromJSONObject(data)
            const peerResult:HttpPeer = {
              version: peerDTO.version,
              currency: peerDTO.currency,
              pubkey: peerDTO.pubkey,
              block: peerDTO.blockstamp,
              endpoints: peerDTO.endpoints,
              signature: peerDTO.signature,
              raw: peerDTO.getRaw()
            }
            wssPeer.broadcast(JSON.stringify(peerResult));
          }
        } catch (e) {
          logger && logger.error('error on ws mapSync:', e);
        }
      }));
  });
};
