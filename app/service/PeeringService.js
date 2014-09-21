var util    = require('util');
var async   = require('async');
var request = require('request');
var _       = require('underscore');
var events  = require('events');
var Status  = require('../models/statusMessage');
var logger  = require('../lib/logger')('peering');
var base58  = require('../lib/base58');

function PeeringService(conn, conf, pair, signFunc, ParametersService) {
  
  var currency = conf.currency;

  var Amendment   = conn.model('Amendment');
  var Transaction = conn.model('Transaction');
  var Merkle      = conn.model('Merkle');
  var Peer        = conn.model('Peer');
  var Key         = conn.model('Key');
  
  var selfPubkey = undefined;
  if (pair) {
    selfPubkey = base58.encode(pair.publicKey);
  }
  this.pubkey = selfPubkey;

  var peer = null;
  var peers = {};
  var that = this;

  this.peer = function (newPeer) {
    if (newPeer) {
      peer = newPeer;
    }
    return peer;
  };

  this.peers = function (newPeers) {
    if (newPeers) {
      peers = newPeers;
    }
    return peers;
  };

  this.upPeers = function () {
    return _(peers).filter(function (p) {
      return p.status == Peer.status.UP;
    });
  };

  this.addPeer = function (p) {
    peers[p.fingerprint] = p;
  };

  this.load = function (done) {
    async.waterfall([
      function (next){
        Peer.find({}, next);
      },
      function (dbPeers, next){
        dbPeers.forEach(function(peer){
          that.addPeer(peer);
        });
        Peer.getTheOne(selfPubkey, function (err, selfPeer) {
          if (selfPeer)
            peer = selfPeer;
          next();
        });
      },
    ], done);
  };

  this.submit = function(peering, callback){
    var peer = new Peer(peering);
    var pubkey = peer.pubkey;
    var fpr = pubkey.fingerprint;
    async.waterfall([
      function (next){
        that.addPeer(peer);
        persistPeer(peer, next);
      }
    ], callback);
  }

  this.submitStatus = function(obj, callback){
    var status = new Status(obj);
    var peer, pubkey;
    var wasStatus = null;
    async.waterfall([
      function (next){
        PublicKey.getTheOne(obj.keyID, next);
      },
      function (pubkey, next){
        Peer.getTheOne(pubkey.fingerprint, next);
      },
      function (theOne, next){
        peer = theOne;
        if (peer.statusSigDate > status.sigDate) {
          next('Old status given');
          return;
        }
        wasStatus = peer.status;
        peer.statusSigDate = status.sigDate;
        peers[peer.fingerprint].status = status;
        peer.setStatus(status.status, next);
      },
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
  }

  function persistPeer (peer, done) {
    async.waterfall([
      function (next){
        Peer.find({ fingerprint: peer.fingerprint }, next);
      },
      function (peers, next){
        var peerEntity = peer;
        var previousHash = null;
        if(peers.length > 0){
          // Already existing peer
          if(peers[0].sigDate > peerEntity.sigDate){
            next('Cannot record a previous peering');
            return;
          }
          peerEntity = peers[0];
          previousHash = peerEntity.hash;
          peer.copyValues(peerEntity);
        }
        peerEntity.save(function (err) {
          next(err, peerEntity, previousHash);
        });
      },
      function (recordedPR, previousHash, next) {
        Merkle.updatePeers(recordedPR, previousHash, function (err, code, merkle) {
          next(err, recordedPR);
        });
      }
    ], done);
  }

  this.submitSelfPeering = function(toPeer, done){
    async.waterfall([
      function (next){
        Peer.getTheOne(selfPubkey, next);
      },
      function (peering, next){
        sendPeering(toPeer, peering, next);
      },
    ], done);
  }

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
        that.sendStatusTo(statusToSend, [peer.fingerprint], next);
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
        Peer.allBut([selfPubkey], next);
      },
      function (allPeers, next) {
        async.forEachSeries(allPeers, function(peer, callback){
          that.helloToPeer(peer, function(err){
            if (err) logger.warn(err);
            callback();
          });
        }, function(err){
          done(err);
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
      statusUpfifo.push(function (callback) {
        that.sendUpSignal(callback);
      });
    }, conf.upSignalInterval || 3600*1000);
    done();
  };

  /**
  * Send given status to a list of peers.
  * @param statusStr Status string to send
  * @param fingerprints List of peers' fingerprints to which status is to be sent
  */
  this.sendStatusTo = function (statusStr, fingerprints, done) {
    async.waterfall([
      async.apply(Peer.getList.bind(Peer), fingerprints),
      function (peers, next) {
        async.forEach(peers, function(peer, callback){
          var status = new Status({
            version: 1,
            currency: currency,
            status: statusStr,
            from: selfPubkey,
            to: peer.fingerprint
          });
          async.waterfall([
            function (next){
              signFunc(status.getRaw(), next);
            },
            function (signature, next) {
              status.sig = signature;
              that.emit('status', status);
              peer.statusSent = status.status;
              peer.statusSigDate = new Date();
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

  this.propagatePeering = function (peering, done) {
    getAllPeersButSelfAnd(peering.fingerprint, function (err, peers) {
      that.emit('peer', peering, peers || []);
    });
  };

  this.propagateMembership = function (membership, done) {
    getRandomInAllPeers(function (err, peers) {
      that.emit('membership', membership, peers || []);
    });
  };

  function getAllPeersButSelfAnd (fingerprint, done) {
    Peer.allBut([selfPubkey, fingerprint], done);
  };

  function getRandomInAllPeers (done) {
    Peer.getRandomlyUPsWithout([selfPubkey], done);
  };

  // TODO
  function getVotingPeers (done) {
    getRandomInAllPeers(done);
  };
};

util.inherits(PeeringService, events.EventEmitter);

module.exports.get = function (conn, conf, pair, signFunc, ParametersService) {
  return new PeeringService(conn, conf, pair, signFunc, ParametersService);
};
