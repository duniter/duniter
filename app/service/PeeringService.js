"use strict";
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
    var peer = new Peer(peering);
    var sp = peer.block.split('-');
    var number = sp[0];
    var sigTime = 0;
    async.waterfall([
      function (next) {
        localValidator(null).checkPeerSignature(peer, next);
      },
      function (next) {
        if (peer.block == constants.PEER.SPECIAL_BLOCK) {
          peer.statusTS = 0;
          peer.status = 'UP';
          next(null, null);
        }
        // Check if document is based upon an existing block as time reference
        else dal.getBlockOrNull(number, next);
      },
      function (block, next){
        sigTime = block ? block.medianTime : 0;
        peer.statusTS = sigTime;
        dal.getPeerOrNull(peer.pubkey, next);
      },
      function (found, next){
        var peerEntity = Peer.statics.peerize(found || peer);
        if(found){
          // Already existing peer
          var sp2 = found.block.split('-');
          var number2 = sp2[0];
          if(number <= number2 && !eraseIfAlreadyRecorded){
            next(constants.ERROR.PEER.ALREADY_RECORDED);
            return;
          }
          peerEntity = Peer.statics.peerize(found);
          peer.copyValues(peerEntity);
          peerEntity.sigDate = new Date(sigTime*1000);
        }
        // Set the peer as UP again
        peerEntity.status = 'UP';
        peerEntity.hash = String(sha1(peerEntity.getRawSigned())).toUpperCase();
        dal.savePeer(peerEntity)
          .then(function(){
            next(null, Peer.statics.peerize(peerEntity));
          })
          .fail(next);
      }
    ], done);
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

  var syncBlockFifo = async.queue(function (task, callback) {
    task(callback);
  }, 1);
  var syncBlockInterval = null;
  this.regularSyncBlock = function (done) {
    if (syncBlockInterval)
      clearInterval(syncBlockInterval);
    syncBlockInterval = setInterval(function () {
      syncBlockFifo.push(syncBlock);
    }, 1000*conf.avgGenTime*constants.NETWORK.SYNC_BLOCK_INTERVAL);
    syncBlock(done);
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
        dal.findPeers(selfPubkey).then(_.partial(next, null)).fail(next);
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
        dal.getPeer(selfPubkey).then(_.partial(next, null)).fail(next);
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

  this.testPeers = function(done) {
    dal.listAllPeers()
      .then(function(peers){
        peers = _.filter(peers, function(p){ return p.pubkey != selfPubkey; });
        return Q.all(peers.map(function(p) {
          var peer = new Peer(p);
          return Q.nfcall(peer.connect)
            .then(function(node){
              // Get peering record of each peer
              return Q.nfcall(node.network.peering.get)
                .then(function(peering){
                  // Submit the peering
                  return Q.nfcall(that.submit, peering)
                    .fail(function(err) {
                      // Not a problem!
                      logger.warn("Peer record %s: %s", peer.pubkey, err.code || err.message || err);
                    });
                })
                .fail(function(err){
                  logger.warn("Peer %s: %s", peer.pubkey, err.code || err.message || err);
                  // The peer is unreachable: set it DOWN
                  peer.status = 'DOWN';
                  return dal.savePeer(peer);
                });
            });
        }));
      })
      .then(function(){
        done();
      })
      .fail(done);
  };

  function syncBlock(callback) {
    var lastAdded = null;
    async.waterfall([
      function (next) {
        dal.getCurrentBlockOrNull(next);
      },
      function(current, next) {
        if (current) {
          logger.info("Check network for new blocks...");
          dal.findAllPeersNEWUPBut([selfPubkey])
            .then(function(peers){
              peers = _.shuffle(peers);
              return peers.reduce(function(promise, peer) {
                return promise
                  .fail(function(err){
                    if (err) {
                      logger.warn(err.message || err);
                    }
                    var p = new Peer(peer);
                    logger.info("Try with %s", p.getURL());
                    return Q.Promise(function(resolve, reject){
                      async.waterfall([
                        function(next) {
                          p.connect(next);
                        },
                        function(node, next) {
                          var errorWithPeer = false;
                          async.whilst(
                            function () {
                              return !errorWithPeer;
                            },
                            function (callback) {
                              async.waterfall([
                                function (next) {
                                  node.blockchain.current(function(err) {
                                    if (err) {
                                      return dal.setPeerDown(p.pubkey)
                                        .fail(function(err2){
                                          next(err2 || err);
                                        });
                                    }
                                    next();
                                  });
                                },
                                function (next) {
                                  node.blockchain.block(current.number + 1, next);
                                },
                                function (block, next) {
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
                                  logger.info("Downloaded block #%s from peer ", block.number, p.getNamedURL());
                                  server.BlockchainService.submitBlock(block, true)
                                    .then(function(block){
                                      return next(null, block);
                                    })
                                    .fail(next);
                                },
                                function(block, next) {
                                  current = block;
                                  lastAdded = block;
                                  next();
                                }
                              ], callback);
                            },
                            function (err) {
                              errorWithPeer = err ? true : false;
                              if (errorWithPeer) {
                                next(err);
                              }
                            }
                          );
                        }
                      ], function(err) {
                        err ? reject(err) : resolve();
                      });
                    });
                  })
              }, Q.reject())
                .fail(function(){
                  logger.info("No new block found");
                  if (lastAdded) {
                    server.router().write(_.extend({ type: 'Block' }, lastAdded));
                  }
                  next();
                });
            });
        }
        else next();
      }
    ], function(err) {
      if (err) {
        logger.warn(err.code || err.message || err);
      }
      callback();
    });
  }
}

util.inherits(PeeringService, events.EventEmitter);

module.exports = function (server, pair, dal) {
  return new PeeringService(server, pair, dal);
};
