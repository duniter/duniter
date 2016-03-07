"use strict";
var co             = require('co');
var util           = require('util');
var async          = require('async');
var _              = require('underscore');
var Q              = require('q');
var events         = require('events');
var crypto         = require('../lib/crypto');
var logger         = require('../lib/logger')('peering');
var base58         = require('../lib/base58');
var dos2unix       = require('../lib/dos2unix');
var hashf          = require('../lib/hashf');
var rawer          = require('../lib/rawer');
var constants      = require('../lib/constants');
var Peer           = require('../lib/entity/peer');
var AbstractService = require('./AbstractService');

const DONT_IF_MORE_THAN_FOUR_PEERS = true;

function PeeringService(server) {

  AbstractService.call(this);
  let conf, dal, pair, selfPubkey, SYNC_BLOCK_INTERVAL;

  this.setConfDAL = (newConf, newDAL, newPair) => {
    dal = newDAL;
    conf = newConf;
    pair = newPair;
    this.pubkey = base58.encode(pair.publicKey);
    selfPubkey = this.pubkey;
    SYNC_BLOCK_INTERVAL = conf.avgGenTime * constants.NETWORK.SYNC_BLOCK_INTERVAL;
  };

  var peer = null;
  var that = this;

  this.peer = function (newPeer) {
    if (newPeer) {
      peer = newPeer;
    }
    return Peer.statics.peerize(peer);
  };

  this.checkPeerSignature = function (p) {
    var raw = rawer.getPeerWithoutSignature(p);
    var sig = p.signature;
    var pub = p.pubkey;
    var signaturesMatching = crypto.verify(raw, sig, pub);
    return !!signaturesMatching;
  };

  this.submitP = function(peering, eraseIfAlreadyRecorded, cautious){
    let thePeer = new Peer(peering);
    let sp = thePeer.block.split('-');
    let blockNumber = parseInt(sp[0]);
    let blockHash = sp[1];
    let sigTime = 0;
    let block;
    let makeCheckings = cautious || cautious === undefined;
    return that.pushFIFO(() => co(function *() {
      if (makeCheckings) {
        let goodSignature = that.checkPeerSignature(thePeer);
        if (!goodSignature) {
          throw 'Signature from a peer must match';
        }
      }
      if (thePeer.block == constants.PEER.SPECIAL_BLOCK) {
        thePeer.statusTS = 0;
        thePeer.status = 'UP';
      } else {
        block = yield dal.getBlockByNumberAndHashOrNull(blockNumber, blockHash);
        if (!block && makeCheckings) {
          throw constants.PEER.UNKNOWN_REFERENCE_BLOCK;
        } else if (!block) {
          thePeer.block = constants.PEER.SPECIAL_BLOCK;
          thePeer.statusTS = 0;
          thePeer.status = 'UP';
        }
      }
      sigTime = block ? block.medianTime : 0;
      thePeer.statusTS = sigTime;
      let found = yield dal.getPeerOrNull(thePeer.pubkey);
      var peerEntity = Peer.statics.peerize(found || thePeer);
      if(found){
        // Already existing peer
        var sp2 = found.block.split('-');
        var previousBlockNumber = parseInt(sp2[0]);
        if(blockNumber <= previousBlockNumber && !eraseIfAlreadyRecorded){
          throw constants.ERROR.PEER.ALREADY_RECORDED;
        }
        peerEntity = Peer.statics.peerize(found);
        thePeer.copyValues(peerEntity);
        peerEntity.sigDate = new Date(sigTime * 1000);
      }
      // Set the peer as UP again
      peerEntity.status = 'UP';
      peerEntity.first_down = null;
      peerEntity.last_try = null;
      peerEntity.hash = String(hashf(peerEntity.getRawSigned())).toUpperCase();
      yield dal.savePeer(peerEntity);
      return Peer.statics.peerize(peerEntity);
    }));
  };

  var peerFifo = async.queue(function (task, callback) {
    task(callback);
  }, 1);
  var peerInterval = null;
  this.regularPeerSignal = function (done) {
    let signalTimeInterval = 1000 * conf.avgGenTime * constants.NETWORK.STATUS_INTERVAL.UPDATE;
    if (peerInterval)
      clearInterval(peerInterval);
    peerInterval = setInterval(function () {
      peerFifo.push(_.partial(generateSelfPeer, conf, signalTimeInterval));
    }, signalTimeInterval);
    generateSelfPeer(conf, signalTimeInterval, done);
  };

  var crawlPeersFifo = async.queue((task, callback) => task(callback), 1);
  var crawlPeersInterval = null;
  this.regularCrawlPeers = function (done) {
    if (crawlPeersInterval)
      clearInterval(crawlPeersInterval);
    crawlPeersInterval = setInterval(()  => crawlPeersFifo.push(crawlPeers), 1000 * conf.avgGenTime * constants.NETWORK.SYNC_PEERS_INTERVAL);
    crawlPeers(DONT_IF_MORE_THAN_FOUR_PEERS, done);
  };

  var syncBlockFifo = async.queue((task, callback) => task(callback), 1);
  var syncBlockInterval = null;
  this.regularSyncBlock = function (done) {
    if (syncBlockInterval)
      clearInterval(syncBlockInterval);
    syncBlockInterval = setInterval(()  => syncBlockFifo.push(syncBlock), 1000 * SYNC_BLOCK_INTERVAL);
    syncBlock(done);
  };

  const FIRST_CALL = true;
  var testPeerFifo = async.queue((task, callback) => task(callback), 1);
  var testPeerFifoInterval = null;
  this.regularTestPeers = function (done) {
    if (testPeerFifoInterval)
      clearInterval(testPeerFifoInterval);
    testPeerFifoInterval = setInterval(() => testPeerFifo.push(testPeers.bind(null, !FIRST_CALL)), 1000 * constants.NETWORK.TEST_PEERS_INTERVAL);
    testPeers(FIRST_CALL, done);
  };

  this.stopRegular = () => {
    clearInterval(peerInterval);
    clearInterval(crawlPeersInterval);
    clearInterval(syncBlockInterval);
    clearInterval(testPeerFifoInterval);
  };

  this.generateSelfPeer = generateSelfPeer;

  function generateSelfPeer(theConf, signalTimeInterval, done) {
    return co(function *() {
      let current = yield server.dal.getCurrentBlockOrNull();
      let currency = theConf.currency;
      let peers = yield dal.findPeers(selfPubkey);
      let p1 = { version: constants.DOCUMENTS_VERSION, currency: currency };
      if(peers.length != 0){
        p1 = _(peers[0]).extend({ version: constants.DOCUMENTS_VERSION, currency: currency });
      }
      let endpoint = 'BASIC_MERKLED_API';
      if (theConf.remotehost) {
        endpoint += ' ' + theConf.remotehost;
      }
      if (theConf.remoteipv4) {
        endpoint += ' ' + theConf.remoteipv4;
      }
      if (theConf.remoteipv6) {
        endpoint += ' ' + theConf.remoteipv6;
      }
      if (theConf.remoteport) {
        endpoint += ' ' + theConf.remoteport;
      }
      if (!currency || endpoint == 'BASIC_MERKLED_API') {
        logger.error('It seems there is an issue with your configuration.');
        logger.error('Please restart your node with:');
        logger.error('$ ucoind restart');
        return Q.Promise((resolve) => null);
      }
      // Choosing next based-block for our peer record: we basically want the most distant possible from current
      let minBlock = current ? current.number - 30 : 0;
      // But if already have a peer record within this distance, we need to take the next block of it
      if (p1) {
        let p1Block = parseInt(p1.block.split('-')[0], 10);
        minBlock = Math.max(minBlock, p1Block + 1);
      }
      // Finally we can't have a negative block
      minBlock = Math.max(0, minBlock);
      let targetBlock = yield server.dal.getBlockOrNull(minBlock);
      var p2 = {
        version: constants.DOCUMENTS_VERSION,
        currency: currency,
        pubkey: selfPubkey,
        block: targetBlock ? [targetBlock.number, targetBlock.hash].join('-') : constants.PEER.SPECIAL_BLOCK,
        endpoints: [endpoint]
      };
      var raw1 = dos2unix(new Peer(p1).getRaw());
      var raw2 = dos2unix(new Peer(p2).getRaw());
      logger.info('External access:', new Peer(raw1 == raw2 ? p1 : p2).getURL());
      if (raw1 != raw2) {
        logger.debug('Generating server\'s peering entry based on block#%s...', p2.block.split('-')[0]);
        p2.signature = yield Q.nfcall(server.sign, raw2);
        p2.pubkey = selfPubkey;
        p2.documentType = 'peer';
        // Submit & share with the network
        yield server.submitP(p2, false);
      } else {
        p1.documentType = 'peer';
        // Share with the network
        server.push(p1);
      }
      let selfPeer = yield dal.getPeer(selfPubkey);
      // Set peer's statut to UP
      selfPeer.documentType = 'selfPeer';
      that.peer(selfPeer);
      server.push(selfPeer);
      logger.info("Next peering signal in %s min", signalTimeInterval / 1000 / 60);
    })
      .then(() => done())
      .catch(done);
  }

  function crawlPeers(dontCrawlIfEnoughPeers, done) {
    if (arguments.length == 1) {
      done = dontCrawlIfEnoughPeers;
      dontCrawlIfEnoughPeers = false;
    }
    logger.info('Crawling the network...');
    return co(function *() {
      let peers = yield dal.listAllPeersWithStatusNewUPWithtout(selfPubkey);
      if (peers.length > constants.NETWORK.COUNT_FOR_ENOUGH_PEERS && dontCrawlIfEnoughPeers == DONT_IF_MORE_THAN_FOUR_PEERS) {
        return;
      }
      let peersToTest = peers.slice().map((p) => Peer.statics.peerize(p));
      let tested = [];
      let found = [];
      while (peersToTest.length > 0) {
        let results = yield peersToTest.map(crawlPeer);
        tested = tested.concat(peersToTest.map((p) => p.pubkey));
        // End loop condition
        peersToTest.splice(0);
        // Eventually continue the loop
        for (let i = 0, len = results.length; i < len; i++) {
          let res = results[i];
          for (let j = 0, len2 = res.length; j < len2; j++) {
            try {
              let subpeer = res[j].leaf.value;
              if (subpeer.currency && tested.indexOf(subpeer.pubkey) === -1) {
                let p = Peer.statics.peerize(subpeer);
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
    })
      .then(() => done()).catch(done);
  }

  function crawlPeer(aPeer) {
    return co(function *() {
      let subpeers = [];
      try {
        logger.debug('Crawling peers of %s %s', aPeer.pubkey.substr(0, 6), aPeer.getNamedURL());
        let node = yield aPeer.connectP();
        //let remotePeer = yield Q.nbind(node.network.peering.get)();
        let json = yield Q.nbind(node.network.peering.peers.get, node)({ leaves: true });
        for (let i = 0, len = json.leaves.length; i < len; i++) {
          let leaf = json.leaves[i];
          let subpeer = yield Q.nbind(node.network.peering.peers.get, node)({ leaf: leaf });
          subpeers.push(subpeer);
        }
        return subpeers;
      } catch (e) {
        return subpeers;
      }
    });
  }

  function testPeers(displayDelays, done) {
    return co(function *() {
      let peers = yield dal.listAllPeers();
      let now = (new Date().getTime());
      peers = _.filter(peers, (p) => p.pubkey != selfPubkey);
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
              yield dal.setPeerDown(p.pubkey);
              // Now we test
              let node = yield Q.nfcall(p.connect);
              let peering = yield Q.nfcall(node.network.peering.get);
              // The node answered, it is no more DOWN!
              logger.info('Node %s (%s:%s) is UP!', p.pubkey.substr(0, 6), p.getHostPreferDNS(), p.getPort());
              yield dal.setPeerUP(p.pubkey);
              // We try to forward its peering entry
              let sp1 = peering.block.split('-');
              let currentBlockNumber = sp1[0];
              let currentBlockHash = sp1[1];
              let sp2 = peering.block.split('-');
              let blockNumber = sp2[0];
              let blockHash = sp2[1];
              if (!(currentBlockNumber == blockNumber && currentBlockHash == blockHash)) {
                // The peering changed
                yield that.submitP(peering);
              }
              // Do not need to display when next check will occur: the node is now UP
              shouldDisplayDelays = false;
            } catch (err) {
              // Error: we set the peer as DOWN
              logger.trace("Peer %s is DOWN (%s)", p.pubkey, (err.httpCode && 'HTTP ' + err.httpCode) || err.code || err.message || err);
              yield dal.setPeerDown(p.pubkey);
              shouldDisplayDelays = true;
            }
          }
          if (shouldDisplayDelays) {
            logger.debug('Will check that node %s (%s:%s) is UP in %s min...', p.pubkey.substr(0, 6), p.getHostPreferDNS(), p.getPort(), (nextWaitRemaining / 60).toFixed(0));
          }
        }
      }
      done();
    })
      .catch(done);
  }

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

  function syncBlock(callback) {
    return co(function *() {
      let current = yield dal.getCurrentBlockOrNull();
      if (current) {
        logger.info("Pulling blocks from the network...");
        let peers = yield dal.findAllPeersNEWUPBut([selfPubkey]);
        peers = _.shuffle(peers);
        for (let i = 0, len = peers.length; i < len; i++) {
          let p = new Peer(peers[i]);
          logger.trace("Try with %s %s", p.getURL(), p.pubkey.substr(0, 6));
          try {
            let node = yield Q.nfcall(p.connect);
            let okUP = yield processAscendingUntilNoBlock(p, node, current);
            if (okUP) {
              let remoteCurrent = yield Q.nfcall(node.blockchain.current);
              // We check if our current block has changed due to ascending pulling
              let nowCurrent = yield dal.getCurrentBlockOrNull();
              logger.trace("Remote #%s Local #%s", remoteCurrent.number, nowCurrent.number);
              if (remoteCurrent.number != nowCurrent.number) {
                yield processLastTen(p, node, nowCurrent);
              }
            }
            // Try to fork as a final treatment
            let nowCurrent = yield dal.getCurrentBlockOrNull();
            yield server.BlockchainService.tryToFork(nowCurrent);
          } catch (e) {
            if (isConnectionError(e)) {
              logger.info("Peer %s unreachable: now considered as DOWN.", p.pubkey);
              yield dal.setPeerDown(p.pubkey);
            }
            else if (e.httpCode == 404) {
              logger.trace("No new block from %s %s", p.pubkey.substr(0, 6), p.getURL());
            }
            else {
              logger.warn(e);
            }
          }
        }
      }
      logger.info('Will pull blocks from the network in %s min %s sec', Math.floor(SYNC_BLOCK_INTERVAL / 60), Math.floor(SYNC_BLOCK_INTERVAL % 60));
      callback();
    })
      .catch((err) => {
        logger.warn(err.code || err.stack || err.message || err);
        callback();
      });
  }

  function isConnectionError(err) {
    return err && (
      err.code == "EINVAL"
      || err.code == "ECONNREFUSED"
      || err.code == "ETIMEDOUT"
      || (err.httpCode !== undefined && err.httpCode !== 404));
  }

  function processAscendingUntilNoBlock(p, node, current) {
    return co(function *() {
      let applied = 0;
      try {
        let downloaded = yield Q.nfcall(node.blockchain.block, current.number + 1);
        if (!downloaded) {
          yield dal.setPeerDown(p.pubkey);
        }
        while (downloaded) {
          downloaded = rawifyTransactions(downloaded);
          try {
            let res = yield server.BlockchainService.submitBlock(downloaded, true);
            applied++;
            if (!res.fork) {
              let nowCurrent = yield dal.getCurrentBlockOrNull();
              yield server.BlockchainService.tryToFork(nowCurrent);
            }
          } catch (err) {
            if (isConnectionError(err)) {
              throw err;
            }
            logger.info("Downloaded block #%s from peer %s => %s", downloaded.number, p.getNamedURL(), err.code || err.message || err);
          }
          if (downloaded.number == 0) {
            downloaded = null;
          } else {
            downloaded = yield Q.nfcall(node.blockchain.block, downloaded.number + 1);
          }
        }
      } catch (err) {
        if (isConnectionError(err)) {
          yield dal.setPeerDown(p.pubkey);
          return false;
        }
        else if (err.httpCode == 404) {
          logger.debug("%s new block from %s at %s", applied, p.pubkey.substr(0, 6), p.getNamedURL());
        }
        else {
          logger.warn(err.code || err.message || err);
        }
      }
      return true;
    });
  }

  function processLastTen(p, node, current) {
    return co(function *() {
      try {
        let downloaded = yield Q.nfcall(node.blockchain.block, current.number);
        if (!downloaded) {
          yield dal.setPeerDown(p.pubkey);
        }
        while (downloaded) {
          downloaded = rawifyTransactions(downloaded);
          try {
            let res = yield server.BlockchainService.submitBlock(downloaded, true);
            if (!res.fork) {
              let nowCurrent = yield dal.getCurrentBlockOrNull();
              yield server.BlockchainService.tryToFork(nowCurrent);
            }
          } catch (err) {
            if (isConnectionError(err)) {
              throw err;
            }
            logger.info("Downloaded block #%s from peer %s => %s", downloaded.number, p.getNamedURL(), err.code || err.message || err || "Unknown error");
          }
          if (downloaded.number == 0 || downloaded.number <= current.number - 10) {
            downloaded = null;
          } else {
            downloaded = yield Q.nfcall(node.blockchain.block, downloaded.number - 1);
          }
        }
      } catch (err) {
        if (isConnectionError(err)) {
          yield dal.setPeerDown(p.pubkey);
        }
        else if (err.httpCode != 404) {
          logger.warn(err.code || err.message || err);
        }
        return false;
      }
      return true;
    });
  }

  function rawifyTransactions(block) {
    // Rawification of transactions
    block.transactions.forEach(function (tx) {
      tx.raw = ["TX", "2", tx.signatories.length, tx.inputs.length, tx.outputs.length, tx.comment ? '1' : '0', tx.locktime || 0].join(':') + '\n';
      tx.raw += tx.signatories.join('\n') + '\n';
      tx.raw += tx.inputs.join('\n') + '\n';
      tx.raw += tx.outputs.join('\n') + '\n';
      if (tx.comment)
        tx.raw += tx.comment + '\n';
      tx.raw += tx.signatures.join('\n') + '\n';
      tx.version = 2;
      tx.currency = conf.currency;
      tx.issuers = tx.signatories;
      tx.hash = ("" + hashf(rawer.getTransaction(tx))).toUpperCase();
    });
    return block;
  }
}

util.inherits(PeeringService, events.EventEmitter);

module.exports = function (server, pair, dal) {
  return new PeeringService(server, pair, dal);
};
