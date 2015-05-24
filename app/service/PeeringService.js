"use strict";
var util           = require('util');
var async          = require('async');
var _              = require('underscore');
var Q              = require('q');
var events         = require('events');
var Status         = require('../lib/entity/status');
var logger         = require('../lib/logger')('peering');
var base58         = require('../lib/base58');
var sha1           = require('sha1');
var moment         = require('moment');
var rawer          = require('../lib/rawer');
var constants      = require('../lib/constants');
var localValidator = require('../lib/localValidator');

function PeeringService(peerserver, pair, signFunc, dal) {

  var conf = peerserver.conf;
  var currency = conf.currency;

  var Peer        = require('../lib/entity/peer');

  var selfPubkey;
  this.pubkey = selfPubkey;

  var peer = null, BlockchainService = null;
  var that = this;

  this.setKeyPair = function(keypair) {
    if (keypair) {
      pair = keypair;
      selfPubkey = base58.encode(pair.publicKey);
      that.pubkey = selfPubkey;
    }
  };

  this.setSignFunc = function(f) {
    signFunc = f;
  };

  this.setBlockchainService = function(service) {
    BlockchainService = service;
  };

  this.peer = function (newPeer) {
    if (newPeer) {
      peer = newPeer;
    }
    return Peer.statics.peerize(peer);
  };

  this.load = function (done) {
  };

  this.submit = function(peering, done){
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
        var previousHash = null;
        if(found){
          // Already existing peer
          var sp2 = found.block.split('-');
          var number2 = sp2[0];
          if(number <= number2){
            next(constants.ERROR.PEER.ALREADY_RECORDED);
            return;
          }
          peerEntity = Peer.statics.peerize(found);
          previousHash = peerEntity.hash;
          peer.copyValues(peerEntity);
          peerEntity.sigDate = new Date(sigTime*1000);
        }
        dal.savePeer(peerEntity, function (err) {
          next(err, peerEntity, previousHash);
        });
      },
      function (recordedPR, previousHash, next) {
        dal.updateMerkleForPeers(function(err) {
          next(err, Peer.statics.peerize(recordedPR));
        });
      }
    ], done);
  };

  this.submitStatus = function(obj, callback){
    var status = new Status(obj);
    var peer;
    var wasStatus = null;
    var sp = status.block.split('-');
    var number = sp[0], fpr = sp[1];
    var sigTime = new Date(0);
    async.waterfall([
      function (next) {
        if (status.to != that.pubkey) {
          next('Node is not concerned by this status');
          return;
        }
        localValidator(null).checkStatusSignature(status, next);
      },
      function (next) {
        if (status.block == constants.STATUS.SPECIAL_BLOCK)
          next(null, null);
        else
          // Check if document is based upon an existing block as time reference
          dal.getBlockOrNull(number, next);
      },
      function (block, next){
        sigTime = block ? block.medianTime : 0;
        dal.getPeer(status.from, next);
      },
      function (theOne, next){
        peer = theOne;
        if (peer.statusBlock) {
          var sp2 = peer.statusBlock.split('-');
          var number2 = sp2[0];
          if(number <= number2){
            next('Old status given');
            return;
          }
        }
        wasStatus = peer.status;
        peer.statusTS = sigTime;
        peer.statusSigDate = new Date(sigTime*1000);
        peer.setStatus(status.status, dal, next);
      },
      function (next) {
        dal.updateMerkleForPeers(next);
      }
    ], function (err) {
      callback(err, status, peer, wasStatus);
      if (!err) {
        async.parallel({
          statusBack: function(callback){
            if (~['NEW', 'NEW_BACK'].indexOf(status.status)) {
              that.helloToPeer(peer, function (err) {
                callback();
              });
            }
            else callback();
          }
        });
      }
    });
  };

  /**
  * Send status to a peer according to his last sent status to us
  **/
  this.helloToPeer = function (peer, done) {
    var actionForReceived = {
      'NOTHING':  'NEW',
      'NEW':      'NEW_BACK',
      'NEW_BACK': 'UP',
      'UP':       'UP',
      'DOWN':     'UP',
      'ASK':      peer.statusSent == 'NOTHING' ? 'NEW' : peer.statusSent || 'NEW'
    };
    async.waterfall([
      function (next){
        var statusToSend = actionForReceived[peer.status] || 'NEW';
        that.sendStatusTo(statusToSend, [peer.pubkey], next);
      }
    ], function () {
      done();
    });
  };

  /**
  * Send status to ALL known peers, for UP event
  */
  this.sendUpSignal = function (done) {
    async.waterfall([
      function (next){
        dal.findAllPeersNEWUPBut([selfPubkey], next);
      },
      function (allPeers, next) {
        async.forEachSeries(allPeers, function(peer, callback){
          that.helloToPeer(peer, function(err){
            if (err) logger.warn(err);
            callback();
          });
        }, function(err){
          next(err);
        });
      }
    ], done);
  };

  var statusUpfifo = async.queue(function (task, callback) {
    task(callback);
  }, 1);
  var statusUpInterval = null;
  this.regularUpSignal = function (done) {
    if (statusUpInterval)
      clearInterval(statusUpInterval);
    statusUpInterval = setInterval(function () {
      statusUpfifo.push(upSignal);
    }, 1000*conf.avgGenTime*constants.NETWORK.STATUS_INTERVAL.UPDATE);
    upSignal(done);
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

  function upSignal(callback) {
    async.waterfall([
      function (next) {
        dal.getCurrentBlockOrNull(next);
      },
      function(current, next) {
        if (current) {
          async.waterfall([
            function (next) {
              // set DOWN for peers with too old status
              dal.setDownWithStatusOlderThan(current.medianTime - conf.avgGenTime*4*conf.medianTimeBlocks, next);
            },
            function (next) {
              dal.updateMerkleForPeers(next);
            },
            function (next) {
              that.sendUpSignal(next);
            }
          ], next);
        }
        else next();
      }
    ], callback);
  }

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
                                  logger.info("Downloaded block #%s from peer ", block.number, peer.getNamedURL());
                                  BlockchainService.submitBlock(block, true, next);
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
                    peerserver.router().write(_.extend({ type: 'Block' }, lastAdded));
                  }
                  next();
                });
            });
        }
        else next();
      }
    ], callback);
  }

  /**
  * Send given status to a list of peers.
  * @param statusStr Status string to send
  * @param pubs List of peers' pubs to which status is to be sent
  */
  this.sendStatusTo = function (statusStr, pubs, done) {
    var current = null;
    async.waterfall([
      function (next) {
        dal.getCurrentBlockOrNull(next);
      },
      function(block, next) {
        if (block) {
          current = block;
        }
        dal.getPeers(pubs, next);
      },
      function (peers, next) {
        async.forEach(peers, function(peer, callback){
          var status = new Status({
            version: 1,
            currency: currency,
            time: new Date(moment.utc().unix()*1000),
            status: statusStr,
            block: current ? [current.number, current.hash].join('-') : '0-DA39A3EE5E6B4B0D3255BFEF95601890AFD80709',
            from: selfPubkey,
            to: peer.pubkey
          });
          async.waterfall([
            function (next){
              signFunc(status.getRaw(), next);
            },
            function (signature, next) {
              status.signature = signature;
              if (statusStr == 'NEW') {
                status.peer = _(that.peer()).extend({ peerTarget: peer.pubkey });
              }
              that.emit('status', status);
              peer.statusSent = status.status;
              dal.savePeer(new Peer(peer), function (err) {
                if (err) logger.error(err);
                next();
              });
            }
          ], callback);
        }, next);
      }
    ], done);
  }
}

util.inherits(PeeringService, events.EventEmitter);

module.exports = function (peerserver, pair, signFunc, dal) {
  return new PeeringService(peerserver, pair, signFunc, dal);
};
