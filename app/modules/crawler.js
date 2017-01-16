"use strict";

const _ = require('underscore');
const co = require('co');
const async = require('async');
const constants = require('../lib/constants');
const Peer = require('../lib/entity/peer');

module.exports = {
  duniter: {
    service: {
      neutral: new Crawler()
    }
  }
}

/**
 * Service which triggers the server's peering generation (actualization of the Peer document).
 * @constructor
 */
function Crawler() {

  const peerCrawler = new PeerCrawler();

  this.startService = (server, conf) => [
    peerCrawler.startService(server, conf)
  ];

  this.stopService = () => [
    peerCrawler.stopService()
  ];
}

function PeerCrawler() {

  const DONT_IF_MORE_THAN_FOUR_PEERS = true;

  let crawlPeersInterval = null, logger;

  const crawlPeersFifo = async.queue((task, callback) => task(callback), 1);

  this.startService = (server, conf) => co(function*() {
    logger = server.logger;
    if (crawlPeersInterval)
      clearInterval(crawlPeersInterval);
    crawlPeersInterval = setInterval(()  => crawlPeersFifo.push(() => crawlPeers(server, conf)), 1000 * conf.avgGenTime * constants.NETWORK.SYNC_PEERS_INTERVAL);
    crawlPeers(server, conf, DONT_IF_MORE_THAN_FOUR_PEERS);
  });

  this.stopService = () => co(function*() {
    crawlPeersFifo.kill();
    clearInterval(crawlPeersInterval);
  });

  const crawlPeers = (server, conf, dontCrawlIfEnoughPeers = false) => {
    logger.info('Crawling the network...');
    return co(function *() {
      const peers = yield server.dal.listAllPeersWithStatusNewUPWithtout(conf.keyPair.pub);
      if (peers.length > constants.NETWORK.COUNT_FOR_ENOUGH_PEERS && dontCrawlIfEnoughPeers == DONT_IF_MORE_THAN_FOUR_PEERS) {
        return;
      }
      let peersToTest = peers.slice().map((p) => Peer.statics.peerize(p));
      let tested = [];
      const found = [];
      while (peersToTest.length > 0) {
        const results = yield peersToTest.map((p) => crawlPeer(server, p));
        tested = tested.concat(peersToTest.map((p) => p.pubkey));
        // End loop condition
        peersToTest.splice(0);
        // Eventually continue the loop
        for (let i = 0, len = results.length; i < len; i++) {
          const res = results[i];
          for (let j = 0, len2 = res.length; j < len2; j++) {
            try {
              const subpeer = res[j].leaf.value;
              if (subpeer.currency && tested.indexOf(subpeer.pubkey) === -1) {
                const p = Peer.statics.peerize(subpeer);
                peersToTest.push(p);
                found.push(p);
              }
            } catch (e) {
              logger.warn('Invalid peer %s', res[j]);
            }
          }
        }
        // Make unique list
        peersToTest = _.uniq(peersToTest, false, (p) => p.pubkey);
      }
      logger.info('Crawling done.');
      for (let i = 0, len = found.length; i < len; i++) {
        let p = found[i];
        try {
          // Try to write it
          p.documentType = 'peer';
          yield server.singleWritePromise(p);
        } catch(e) {
          // Silent error
        }
      }
    });
  };

  const crawlPeer = (server, aPeer) => co(function *() {
    let subpeers = [];
    try {
      logger.debug('Crawling peers of %s %s', aPeer.pubkey.substr(0, 6), aPeer.getNamedURL());
      const node = yield aPeer.connect();
      yield checkPeerValidity(server, aPeer, node);
      //let remotePeer = yield Q.nbind(node.network.peering.get)();
      const json = yield node.getPeers.bind(node)({ leaves: true });
      for (let i = 0, len = json.leaves.length; i < len; i++) {
        let leaf = json.leaves[i];
        let subpeer = yield node.getPeers.bind(node)({ leaf: leaf });
        subpeers.push(subpeer);
      }
      return subpeers;
    } catch (e) {
      return subpeers;
    }
  });
}

const checkPeerValidity = (server, p, node) => co(function *() {
  try {
    let document = yield node.getPeer();
    let thePeer = Peer.statics.peerize(document);
    let goodSignature = server.PeeringService.checkPeerSignature(thePeer);
    if (!goodSignature) {
      throw 'Signature from a peer must match';
    }
    if (p.currency !== thePeer.currency) {
      throw 'Currency has changed from ' + p.currency + ' to ' + thePeer.currency;
    }
    if (p.pubkey !== thePeer.pubkey) {
      throw 'Public key of the peer has changed from ' + p.pubkey + ' to ' + thePeer.pubkey;
    }
    let sp1 = p.block.split('-');
    let sp2 = thePeer.block.split('-');
    let blockNumber1 = parseInt(sp1[0]);
    let blockNumber2 = parseInt(sp2[0]);
    if (blockNumber2 < blockNumber1) {
      throw 'Signature date has changed from block ' + blockNumber1 + ' to older block ' + blockNumber2;
    }
  } catch (e) {
    throw { code: "E_DUNITER_PEER_CHANGED" };
  }
});
