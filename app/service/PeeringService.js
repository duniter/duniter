"use strict";
var co             = require('co');
var util           = require('util');
var async          = require('async');
var _              = require('underscore');
var Q              = require('q');
var events         = require('events');
var logger         = require('../lib/logger')('peering');
var base58         = require('../lib/base58');
var sha1           = require('sha1');
var moment         = require('moment');
var rawer          = require('../lib/rawer');
var constants      = require('../lib/constants');
var localValidator = require('../lib/localValidator');
var blockchainCtx   = require('../lib/blockchainContext');

const FROM_PULL = true;

function PeeringService(server, pair, dal) {

  var conf = server.conf;

  var Peer        = require('../lib/entity/peer');

  var selfPubkey = base58.encode(pair.publicKey);
  this.pubkey = selfPubkey;

  var peer = null;
  var that = this;

  this.setDAL = function(theDAL) {
    dal = theDAL;
  };

  this.peer = function (newPeer) {
    if (newPeer) {
      peer = newPeer;
    }
    return Peer.statics.peerize(peer);
  };

  this.submit = function(peering, eraseIfAlreadyRecorded, done){
    if (arguments.length == 2) {
      done = eraseIfAlreadyRecorded;
      eraseIfAlreadyRecorded = false;
    }
    let thePeer = new Peer(peering);
    let sp = thePeer.block.split('-');
    let blockNumber = sp[0];
    let blockHash = sp[1];
    let sigTime = 0;
    let block;
    return co(function *() {
      let goodSignature = localValidator(null).checkPeerSignature(thePeer);
      if (!goodSignature) {
        throw 'Signature from a peer must match';
      }
      if (thePeer.block == constants.PEER.SPECIAL_BLOCK) {
        thePeer.statusTS = 0;
        thePeer.status = 'UP';
      } else {
        block = yield dal.getBlockByNumberAndHashOrNull(blockNumber, blockHash);
        if (!block) {
          throw constants.PEER.UNKNOWN_REFERENCE_BLOCK;
        }
      }
      sigTime = block ? block.medianTime : 0;
      thePeer.statusTS = sigTime;
      let found = yield dal.getPeerOrNull(thePeer.pubkey);
      var peerEntity = Peer.statics.peerize(found || thePeer);
      if(found){
        // Already existing peer
        var sp2 = found.block.split('-');
        var previousBlockNumber = sp2[0];
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
      peerEntity.hash = String(sha1(peerEntity.getRawSigned())).toUpperCase();
      yield dal.savePeer(peerEntity);
      let res = Peer.statics.peerize(peerEntity);
      done(null, res);
      return res;
    })
      .catch(done);
  };

  var peerFifo = async.queue(function (task, callback) {
    task(callback);
  }, 1);
  var peerInterval = null;
  this.regularPeerSignal = function (done) {
    if (peerInterval)
      clearInterval(peerInterval);
    peerInterval = setInterval(function () {
      peerFifo.push(_.partial(generateSelfPeer, conf));
    }, 1000*conf.avgGenTime*constants.NETWORK.STATUS_INTERVAL.UPDATE);
    generateSelfPeer(conf, done);
  };

  var syncBlockFifo = async.queue((task, callback) => task(callback), 1);
  var syncBlockInterval = null;
  this.regularSyncBlock = function (done) {
    if (syncBlockInterval)
      clearInterval(syncBlockInterval);
    syncBlockInterval = setInterval(()  => syncBlockFifo.push(syncBlock), 1000*conf.avgGenTime*constants.NETWORK.SYNC_BLOCK_INTERVAL);
    syncBlock(done);
  };

  var testPeerFifo = async.queue((task, callback) => task(callback), 1);
  var testPeerFifoInterval = null;
  this.regularTestPeers = function (done) {
    if (testPeerFifoInterval)
      clearInterval(testPeerFifoInterval);
    testPeerFifoInterval = setInterval(() => testPeerFifo.push(testPeers), 1000 * conf.avgGenTime * constants.NETWORK.TEST_PEERS_INTERVAL);
    testPeers(done);
  };

  this.generateSelfPeer = generateSelfPeer;

  function generateSelfPeer(conf, done) {
    var currency = conf.currency;
    var current = null;
    async.waterfall([
      function (next) {
        blockchainCtx(conf, dal).current(next);
      },
      function (currentBlock, next) {
        current = currentBlock;
        dal.findPeers(selfPubkey).then(_.partial(next, null)).catch(next);
      },
      function (peers, next) {
        var p1 = { version: 1, currency: currency };
        if(peers.length != 0){
          p1 = _(peers[0]).extend({ version: 1, currency: currency });
        }
        var endpoint = 'BASIC_MERKLED_API';
        if (conf.remotehost) {
          endpoint += ' ' + conf.remotehost;
        }
        if (conf.remoteipv4) {
          endpoint += ' ' + conf.remoteipv4;
        }
        if (conf.remoteipv6) {
          endpoint += ' ' + conf.remoteipv6;
        }
        if (conf.remoteport) {
          endpoint += ' ' + conf.remoteport;
        }
        var p2 = {
          version: 1,
          currency: currency,
          pubkey: selfPubkey,
          block: current ? [current.number, current.hash].join('-') : constants.PEER.SPECIAL_BLOCK,
          endpoints: [endpoint]
        };
        var raw1 = new Peer(p1).getRaw().dos2unix();
        var raw2 = new Peer(p2).getRaw().dos2unix();
        logger.info('External access:', new Peer(raw1 == raw2 ? p1 : p2).getURL());
        if (raw1 != raw2) {
          logger.debug('Generating server\'s peering entry...');
          async.waterfall([
            function (next){
              server.sign(raw2, next);
            },
            function (signature, next) {
              p2.signature = signature;
              p2.pubkey = selfPubkey;
              p2.documentType = 'peer';
              server.submit(p2, false, next);
            }
          ], function (err) {
            next(err);
          });
        } else {
          p1.documentType = 'peer';
          server.push(p1);
          next();
        }
      },
      function (next){
        dal.getPeer(selfPubkey).then(_.partial(next, null)).catch(next);
      },
      function (peer, next){
        // Set peer's statut to UP
        peer.documentType = 'peer';
        that.peer(peer);
        server.push(peer);
        next();
      }
    ], function(err) {
      done(err);
    });
  }

  function testPeers(done) {
    return co(function *() {
      let peers = yield dal.listAllPeers();
      let now = (new Date().getTime());
      peers = _.filter(peers, (p) => p.pubkey != selfPubkey);
      for (let i = 0, len = peers.length; i < len; i++) {
        let p = new Peer(peers[i]);
        if (p.status == 'DOWN') {
          let downAt = p.first_down || now;
          let downDelay = Math.floor((now - downAt) / 1000);
          let waitedSinceLastTest = Math.floor((now - (p.last_try || now)) / 1000);
          let testIt = 
               (downDelay <= constants.DURATIONS.A_MINUTE    && waitedSinceLastTest >= constants.DURATIONS.TEN_SECONDS)
            || (downDelay <= constants.DURATIONS.TEN_MINUTES && waitedSinceLastTest >= constants.DURATIONS.A_MINUTE)
            || (downDelay <= constants.DURATIONS.AN_HOUR     && waitedSinceLastTest >= constants.DURATIONS.TEN_MINUTES)
            || (downDelay <= constants.DURATIONS.A_DAY       && waitedSinceLastTest >= constants.DURATIONS.AN_HOUR)
            || (downDelay <= constants.DURATIONS.A_WEEK      && waitedSinceLastTest >= constants.DURATIONS.A_DAY)
            || (downDelay <= constants.DURATIONS.A_MONTH     && waitedSinceLastTest >= constants.DURATIONS.A_WEEK)
          ;
          if (testIt) {
            // We try to reconnect only with peers marked as DOWN
            let node = yield Q.nfcall(p.connect);
            let peering = yield Q.nfcall(node.network.peering.get);
            let sp1 = peering.block.split('-');
            let currentBlockNumber = sp1[0];
            let currentBlockHash = sp1[1];
            let sp2 = peering.block.split('-');
            let blockNumber = sp2[0];
            let blockHash = sp2[1];
            if (!(currentBlockNumber == blockNumber && currentBlockHash == blockHash)) {
              // The peering changed
              try {
                yield Q.nfcall(that.submit, peering);
              } catch (err) {
                // Error: we set the peer as DOWN
                logger.warn("Peer record %s: %s", p.pubkey, err.code || err.message || err);
                yield dal.setPeerDown(p.pubkey);
              }
            }
          }
        }
      }
      done();
    })
      .catch(done);
  }

  function syncBlock(callback) {
    return co(function *() {
      let current = dal.getCurrentBlockOrNull();
      if (current) {
        logger.info("Check network for new blocks...");
        let peers = yield dal.findAllPeersNEWUPBut([selfPubkey]);
        peers = _.shuffle(peers);
        for (let i = 0, len = peers.length; i < len; i++) {
          var p = new Peer(peers[i]);
          logger.info("Try with %s", p.getURL());
          let node = yield Q.nfcall(p.connect);
          try {
            let downloaded = yield Q.nfcall(node.blockchain.current);
            if (!downloaded) {
              yield dal.setPeerDown(p.pubkey);
            }
            while (downloaded) {
              logger.info("Downloaded block #%s from peer %s", downloaded.number, p.getNamedURL());
              downloaded = rawifyTransactions(downloaded);
              yield server.BlockchainService.submitBlock(downloaded, true, FROM_PULL);
              if (downloaded.number == 0) {
                downloaded = null;
              } else {
                downloaded = yield Q.nfcall(node.blockchain.block, downloaded.number - 1);
              }
            }
          } catch (err) {
            logger.warn(err);
          }
        }
        callback();
      }
    })
      .catch((err) => {
        logger.warn(err.code || err.stack || err.message || err);
        callback();
      });
  }

  function rawifyTransactions(block) {
    // Rawification of transactions
    block.transactions.forEach(function (tx) {
      tx.raw = ["TX", "1", tx.signatories.length, tx.inputs.length, tx.outputs.length, tx.comment ? '1' : '0'].join(':') + '\n';
      tx.raw += tx.signatories.join('\n') + '\n';
      tx.raw += tx.inputs.join('\n') + '\n';
      tx.raw += tx.outputs.join('\n') + '\n';
      if (tx.comment)
        tx.raw += tx.comment + '\n';
      tx.raw += tx.signatures.join('\n') + '\n';
      tx.version = 1;
      tx.currency = conf.currency;
      tx.issuers = tx.signatories;
      tx.hash = ("" + sha1(rawer.getTransaction(tx))).toUpperCase();
    });
    return block;
  }
}

util.inherits(PeeringService, events.EventEmitter);

module.exports = function (server, pair, dal) {
  return new PeeringService(server, pair, dal);
};
