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
  const peerTester = new PeerTester();

  this.startService = (server, conf) => [
    peerCrawler.startService(server, conf),
    peerTester.startService(server, conf)
  ];

  this.stopService = () => [
    peerCrawler.stopService(),
    peerTester.stopService()
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
    yield crawlPeers(server, conf, DONT_IF_MORE_THAN_FOUR_PEERS);
  });

  this.stopService = () => co(function*() {
    crawlPeersFifo.kill();
    clearInterval(crawlPeersInterval);
  });

  const crawlPeers = (server, conf, dontCrawlIfEnoughPeers = false) => {
    logger.info('Crawling the network...');
    return co(function *() {
      const peers = yield server.dal.listAllPeersWithStatusNewUPWithtout(conf.pair.pub);
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

function PeerTester() {

  const FIRST_CALL = true;

  const testPeerFifo = async.queue((task, callback) => task(callback), 1);
  let testPeerFifoInterval = null;
  let logger;

  this.startService = (server, conf) => co(function*() {
    logger = server.logger;
    if (testPeerFifoInterval)
      clearInterval(testPeerFifoInterval);
    testPeerFifoInterval = setInterval(() => testPeerFifo.push(testPeers.bind(null, server, conf, !FIRST_CALL)), 1000 * constants.NETWORK.TEST_PEERS_INTERVAL);
    yield testPeers(server, conf, FIRST_CALL);
  });

  this.stopService = () => co(function*() {
    clearInterval(testPeerFifoInterval);
    testPeerFifo.kill();
  });

  const testPeers = (server, conf, displayDelays) => co(function *() {
    let peers = yield server.dal.listAllPeers();
    let now = (new Date().getTime());
    peers = _.filter(peers, (p) => p.pubkey != conf.pair.pub);
    for (let i = 0, len = peers.length; i < len; i++) {
      let p = new Peer(peers[i]);
      if (p.status == 'DOWN') {
        let shouldDisplayDelays = displayDelays;
        let downAt = p.first_down || now;
        let waitRemaining = getWaitRemaining(now, downAt, p.last_try);
        let nextWaitRemaining = getWaitRemaining(now, downAt, now);
        let testIt = waitRemaining <= 0;
        if (testIt) {
          // We try to reconnect only with peers marked as DOWN
          try {
            logger.trace('Checking if node %s is UP... (%s:%s) ', p.pubkey.substr(0, 6), p.getHostPreferDNS(), p.getPort());
            // We register the try anyway
            yield server.dal.setPeerDown(p.pubkey);
            // Now we test
            let node = yield p.connect();
            let peering = yield node.getPeer();
            yield checkPeerValidity(server, p, node);
            // The node answered, it is no more DOWN!
            logger.info('Node %s (%s:%s) is UP!', p.pubkey.substr(0, 6), p.getHostPreferDNS(), p.getPort());
            yield server.dal.setPeerUP(p.pubkey);
            // We try to forward its peering entry
            let sp1 = peering.block.split('-');
            let currentBlockNumber = sp1[0];
            let currentBlockHash = sp1[1];
            let sp2 = peering.block.split('-');
            let blockNumber = sp2[0];
            let blockHash = sp2[1];
            if (!(currentBlockNumber == blockNumber && currentBlockHash == blockHash)) {
              // The peering changed
              yield server.PeeringService.submitP(peering);
            }
            // Do not need to display when next check will occur: the node is now UP
            shouldDisplayDelays = false;
          } catch (err) {
            // Error: we set the peer as DOWN
            logger.trace("Peer %s is DOWN (%s)", p.pubkey, (err.httpCode && 'HTTP ' + err.httpCode) || err.code || err.message || err);
            yield server.dal.setPeerDown(p.pubkey);
            shouldDisplayDelays = true;
          }
        }
        if (shouldDisplayDelays) {
          logger.debug('Will check that node %s (%s:%s) is UP in %s min...', p.pubkey.substr(0, 6), p.getHostPreferDNS(), p.getPort(), (nextWaitRemaining / 60).toFixed(0));
        }
      }
    }
  });

  function getWaitRemaining(now, downAt, last_try) {
    let downDelay = Math.floor((now - downAt) / 1000);
    let waitedSinceLastTest = Math.floor((now - (last_try || now)) / 1000);
    let waitRemaining = 1;
    if (downDelay <= constants.DURATIONS.A_MINUTE) {
      waitRemaining = constants.DURATIONS.TEN_SECONDS - waitedSinceLastTest;
    }
    else if (downDelay <= constants.DURATIONS.TEN_MINUTES) {
      waitRemaining = constants.DURATIONS.A_MINUTE - waitedSinceLastTest;
    }
    else if (downDelay <= constants.DURATIONS.AN_HOUR) {
      waitRemaining = constants.DURATIONS.TEN_MINUTES - waitedSinceLastTest;
    }
    else if (downDelay <= constants.DURATIONS.A_DAY) {
      waitRemaining = constants.DURATIONS.AN_HOUR - waitedSinceLastTest;
    }
    else if (downDelay <= constants.DURATIONS.A_WEEK) {
      waitRemaining = constants.DURATIONS.A_DAY - waitedSinceLastTest;
    }
    else if (downDelay <= constants.DURATIONS.A_MONTH) {
      waitRemaining = constants.DURATIONS.A_WEEK - waitedSinceLastTest;
    }
    // Else do not check it, DOWN for too long
    return waitRemaining;
  }
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
