var util           = require('util');
var async          = require('async');
var request        = require('request');
var _              = require('underscore');
var events         = require('events');
var Status         = require('../models/statusMessage');
var logger         = require('../lib/logger')('peering');
var base58         = require('../lib/base58');
var moment         = require('moment');
var constants      = require('../lib/constants');
var localValidator = require('../lib/localValidator');

function PeeringService(conn, conf, pair, signFunc, dal) {
  
  var currency = conf.currency;

  var Block       = conn.model('Block');
  var Merkle      = conn.model('Merkle');
  var Peer        = require('../lib/entity/peer');
  
  var selfPubkey = undefined;
  this.pubkey = selfPubkey;

  var peer = null;
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

  this.peer = function (newPeer) {
    if (newPeer) {
      peer = newPeer;
    }
    return peer;
  };

  this.load = function (done) {
  };

  this.submit = function(peering, callback){
    var peer = new Peer(peering);
    var sp = peer.block.split('-');
    var number = sp[0], fpr = sp[1];
    var sigTime = new Date(0);
    async.waterfall([
      function (next) {
        localValidator(null).checkPeerSignature(peer, next);
      },
      function (next) {
        if (peer.block == constants.PEER.SPECIAL_BLOCK)
          next(null, null);
        else
          // Check if document is based upon an existing block as time reference
          Block.findByNumberAndHash(number, fpr, next);
      },
      function (block, next){
        sigTime = block ? block.medianTime : 0;
        dal.getPeerOrNull(peer.pub, next);
      },
      function (found, next){
        var peerEntity = peer;
        var previousHash = null;
        if(found){
          // Already existing peer
          var sp2 = found.block.split('-');
          var number2 = sp2[0], fpr2 = sp2[1];
          if(number <= number2){
            next(constants.ERROR.PEER.ALREADY_RECORDED);
            return;
          }
          peerEntity = found;
          previousHash = peerEntity.hash;
          peer.copyValues(peerEntity);
          peerEntity.sigDate = new Date(sigTime*1000);
        }
        dal.savePeer(peerEntity, function (err) {
          next(err, peerEntity, previousHash);
        });
      },
      function (recordedPR, previousHash, next) {
        Merkle.updateForPeers(dal, function (err) {
          next(err, recordedPR);
        });
      }
    ], callback);
  }

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
          Block.findByNumberAndHash(number, fpr, next);
      },
      function (block, next){
        sigTime = block ? block.medianTime : 0;
        dal.getPeer(status.from, next);
      },
      function (theOne, next){
        peer = theOne;
        if (peer.statusBlock) {
          var sp2 = peer.statusBlock.split('-');
          var number2 = sp2[0], fpr2 = sp2[1];
          if(number <= number2){
            next('Old status given');
            return;
          }
        }
        wasStatus = peer.status;
        peer.statusSigDate = new Date(sigTime*1000);
        peer.setStatus(status.status, next);
      },
      function (next) {
        Merkle.updateForPeers(dal, next);
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
          },
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
        that.sendStatusTo(statusToSend, [peer.pub], next);
      },
    ], function (err) {
      if (err) plogger.error(err);
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
  }

  var statusUpfifo = async.queue(function (task, callback) {
    task(callback);
  }, 1);
  var statusUpInterval = null;
  this.regularUpSignal = function (done) {
    if (statusUpInterval)
      clearInterval(statusUpInterval);
    statusUpInterval = setInterval(function () {
      statusUpfifo.push(upSignal);
    }, 1000*conf.avgGenTime*10);
    upSignal(done);
  };

  function upSignal(callback) {
    async.waterfall([
      function (next) {
        Block.current(function(err, block) {
          next(null, block || null);
        });
      },
      function(current, next) {
        if (current) {
          async.waterfall([
            function (next) {
              // set DOWN for peers with too old status
              dal.setDownWithStatusOlderThan(current.medianTime - conf.avgGenTime*4*conf.medianTimeBlocks, next);
            },
            function (next) {
              Merkle.updateForPeers(dal, next);
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

  /**
  * Send given status to a list of peers.
  * @param statusStr Status string to send
  * @param pubs List of peers' pubs to which status is to be sent
  */
  this.sendStatusTo = function (statusStr, pubs, done) {
    var current = null;
    async.waterfall([
      function (next) {
        Block.current(function (err, block) {
        current = block;
          next();
        });
      },
      function(next) {
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
            to: peer.pub
          });
          async.waterfall([
            function (next){
              signFunc(status.getRaw(), next);
            },
            function (signature, next) {
              status.signature = signature;
              if (statusStr == 'NEW') {
                status.peer = _(that.peer()).extend({ peerTarget: peer.pub });
              }
              that.emit('status', status);
              peer.statusSent = status.status;
              peer.save(function (err) {
                if (err) logger.error(err);
                next();
              });
            },
          ], callback);
        }, next);
      },
    ], done);
  }
};

util.inherits(PeeringService, events.EventEmitter);

module.exports.get = function (conn, conf, pair, signFunc, dal) {
  return new PeeringService(conn, conf, pair, signFunc, dal);
};
