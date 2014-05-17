var util        = require('util');
var jpgp        = require('../lib/jpgp');
var async       = require('async');
var request     = require('request');
var mongoose    = require('mongoose');
var openpgp     = require('openpgp');
var _           = require('underscore');
var Wallet      = mongoose.model('Wallet');
var Amendment   = mongoose.model('Amendment');
var PublicKey   = mongoose.model('PublicKey');
var Transaction = mongoose.model('Transaction');
var Merkle      = mongoose.model('Merkle');
var Vote        = mongoose.model('Vote');
var Peer        = mongoose.model('Peer');
var Key         = mongoose.model('Key');
var Forward     = mongoose.model('Forward');
var Status      = require('../models/statusMessage');
var events      = require('events');
var service     = require('../service');
var logger      = require('../lib/logger')('peering');

// Services
var ParametersService = service.Parameters;

function PeeringService(pgp, currency, conf) {
  
  this.privateKey = openpgp.key.readArmored(conf.pgpkey).keys[0];
  this.privateKey.decrypt(conf.pgppasswd);
  this.ascciiPubkey = this.privateKey ? this.privateKey.toPublic().armor() : "";
  this.cert = this.ascciiPubkey ? jpgp().certificate(this.ascciiPubkey) : { fingerprint: '' };

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
        Peer.getTheOne(that.cert.fingerprint, function (err, selfPeer) {
          if (selfPeer)
            peer = selfPeer;
          next();
        });
      },
      function (next){
        logger.debug('Loaded service: Peering');
        next();
      },
    ], done);
  };

  this.submit = function(signedPR, keyID, callback){
    var peer = new Peer();
    async.waterfall([
      function (next){
        peer.parse(signedPR, next);
      },
      function (peer, next){
        peer.verify(currency, next);
      },
      // Looking for corresponding public key
      function(valid, next){
        if(!valid){
          next('Not a valid peering request');
          return;
        }
        logger.debug('⬇ %s %s:%s', peer.fingerprint, peer.getIPv4() || peer.getIPv6(), peer.getPort());
        PublicKey.getForPeer(peer, next);
      },
      function (pubkey, next){
        if(!pubkey.fingerprint.match(new RegExp(keyID + "$", "g"))){
          next('Peer\'s public key ('+pubkey.fingerprint+') does not match signatory (0x' + keyID + ')');
          return;
        }
        if(!peer.fingerprint.match(new RegExp(keyID + "$", "g"))){
          next('Fingerprint in peering entry ('+pubkey.fingerprint+') does not match signatory (0x' + keyID + ')');
          return;
        }
        that.addPeer(peer);
        next(null, pubkey.raw);
      },
      function (pubkey, next){
        persistPeering(signedPR, pubkey, next);
      }
    ], callback);
  }

  this.submitStatus = function(signedSR, callback){
    var status = new Status();
    var peer, pubkey;
    var wasStatus = null;
    async.waterfall([
      function (next){
        status.parse(signedSR, next);
      },
      function (status, next){
        status.verify(currency, next);
      },
      // Looking for corresponding public key
      function(valid, next){
        if(!valid){
          next('Not a valid status request');
          return;
        }
        PublicKey.getFromSignature(status.signature, next);
      },
      function (pk, next){
        pubkey = pk;
        status.verifySignature(pubkey.raw, next);
      },
      function (verified, next){
        if (!verified) {
          next('Wrong signature');
          return;
        }
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
            if (status.status == 'NEW') {
              that.helloToPeer(peer, function (err) {
                callback();
              });
            }
            else callback();
          },
          forwardBack: function(callback){
            // If good status, negociate Forward
            if (~['NEW', 'NEW_BACK'].indexOf(peer.status)){
              // Send forward request if not done yet
              async.waterfall([
                function (next){
                  // Any previous forward must be removed and resent by each other
                  Forward.remove({ $or: [ {from: peer.fingerprint}, {to: peer.fingerprint} ] }, function (err, fwds) {
                    next(err);
                  });
                },
                function (next){
                  that.negociateForward(peer, next);
                },
              ], function (err, needForward) {
                if(err) slogger.error(err);
              });
            }
            callback();
          },
        });
      }
    });
  }

  function persistPeering (signedPR, pubkey, done) {
    var peer = new Peer();
    async.waterfall([
      function (next){
        peer.parse(signedPR, next);
      },
      function (peer, next){
        peer.verify(currency, next);
      },
      function (verified, next) {
        peer.verifySignature(pubkey, next);
      },
      function (verified, next){
        if(!verified){
          next('Signature does not match');
          return;
        }
        next();
      },
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

  this.negociateForward = function (peer, done) {
    var forward;
    async.waterfall([
      function (next) {
        if(peer.fingerprint == that.cert.fingerprint){
          next('Cannot negociate Forward with self node');
          return;
        }
        next();
      },
      function (next) {
        Forward.removeTheOne(this.cert.fingerprint, peer.fingerprint, next);
      },
      function (next) {
        forward = new Forward({
          version: 1,
          currency: currency,
          from: that.cert.fingerprint,
          to: peer.fingerprint,
          forward: 'ALL'
        });
        if(conf.kmanagement == 'KEYS'){
          Key.getManaged(function (err, keys) {
            var theKeys = keys || [];
            theKeys.sort();
            forward.forward = 'KEYS';
            forward.keys = theKeys;
            next();
          });
        } else {
          next();
        }
      },
      function (next) {
        jpgp().sign(forward.getRaw(), that.privateKey, next);
      },
      function (signature, next) {
        forward.signature = signature;
        that.sendForward(peer, forward, next);
      },
      function (next) {
        forward.save(next);
      }
    ], function (err) {
      done();
    });
  }

  this.sendForward = function (peer, forward, done) {
    that.propagateForward(forward, peer, function (err, res, body) {
      if(!err && res && res.statusCode && res.statusCode == 404) done('This node is unknown to peer ' + peer.fingerprint);
      else if(!res) done('No HTTP result');
      else if(!res.statusCode) done('No HTTP result code');
      else done(err);
    });
  }

  this.propagateWallet = function (entry, done) {
    async.waterfall([
      function (next) {
        if(entry.propagated){
          next('Wallet entry for ' + entry.fingerprint + ' already propagated', true);
          return;
        }
        next();
      },
      function (next) {
        getAllPeers(function (err, peers) {
          that.emit('wallet', entry, peers || []);
          next(null, true);
        });
      },
    ], done);
  }

  this.propagateTransaction = function (req, done) {
    var am = null;
    var pubkey = null;
    async.waterfall([
      function (next){
        ParametersService.getTransaction(req, next);
      },
      function (tx, next) {
        async.waterfall([
          function (next){
            var fingerprints = [];
            async.waterfall([
              function (next){
                Transaction.getBySenderAndNumber(tx.sender, tx.number, function (err, dbTX) {
                  if(!err && dbTX){
                    tx.propagated = true;
                    dbTX.propagated = true;
                    dbTX.save(function (err) {
                      next(err);
                    });
                  }
                  else next();
                });
              },
              function (next){
                Forward.findMatchingTransaction(tx, next);
              },
              function (fwds, next) {
                fwds.forEach(function (fwd) {
                  fingerprints.push(fwd.from);
                });
                next();
              },
              function (next){
                Wallet.findMatchingTransaction(tx, next);
              },
              function (entries, next){
                entries.forEach(function(entry){
                  entry.hosters.forEach(function(host){
                    fingerprints.push(host);
                  });
                });
                next();
              },
              function (next){
                async.waterfall([
                  function (next){
                    fingerprints.sort();
                    fingerprints = _(fingerprints).uniq();
                    Peer.getList(fingerprints, function (err, peers) {
                      that.emit('transaction', tx, peers || []);
                      next();
                    });
                  },
                ], next);
              },
            ], next);
          }
        ], next);
      }
    ], done);
  }

  this.submitSelfPeering = function(toPeer, done){
    async.waterfall([
      function (next){
        Peer.getTheOne(that.cert.fingerprint, next);
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
        Peer.allBut([that.cert.fingerprint], next);
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

  /**
  * Send given status to a list of peers.
  * @param statusStr Status string to send
  * @param fingerprints List of peers' fingerprints to which status is to be sent
  */
  this.sendStatusTo = function (statusStr, fingerprints, done) {
    var status = new Status({
      version: 1,
      currency: currency,
      status: statusStr
    });
    var raw = status.getRaw().unix2dos();
    async.waterfall([
      function (next){
        jpgp().sign(raw, that.privateKey, next);
      },
      function (signature, next) {
        status.signature = signature.substring(signature.indexOf('-----BEGIN PGP SIGNATURE'));
        async.waterfall([
          async.apply(Peer.getList.bind(Peer), fingerprints),
          function (peers) {
            that.emit('status', status, peers || [], false, function (err) {
              async.forEach(peers, function(peer, callback){
                peer.statusSent = status.status;
                peer.statusSigDate = status.sigDate;
                peer.save(function (err) {
                  if (err) logger.error(err);
                  callback();
                });
              });
            });
            next();
          }
        ], next);
      },
    ], done);
  }

  this.propagatePubkey = function (pubkey) {
    getAllPeers(function (err, peers) {
      that.emit('pubkey', pubkey, peers || []);
    });
  };

  this.propagateVote = function (amendment, vote) {
    getVotingPeers(function (err, peers) {
      that.emit('vote', vote, peers || []);
    });
  };

  this.propagatePeering = function (peering, done) {
    getAllPeersButSelfAnd(peering.fingerprint, function (err, peers) {
      that.emit('peer', peering, peers || []);
    });
  };

  this.propagateMembership = function (membership, done) {
    getAllPeers(function (err, peers) {
      that.emit('membership', membership, peers || []);
    });
  };

  this.propagateVoting = function (voting, done) {
    getAllPeers(function (err, peers) {
      that.emit('voting', voting, peers || []);
    });
  };

  this.propagateForward = function (forward, peer, done) {
    that.emit('forward', forward, [peer], done);
  };

  this.coinIsOwned = function (owner, coin, tx, wallet, done) {
    var nbConfirmations = 0;
    async.forEach(wallet.trusts, function(trust, callback){
      async.waterfall([
        function (next){
          Peer.getTheOne(trust, next);
        },
        function (peer, next){
          peer.connect(next);
        },
        function (node, next){
          async.waterfall([
            function (next){
              node.hdc.coins.owner(coin.issuer, coin.amNumber, coin.coinNumber, next);
            },
            function (owning, next) {
              if (owning.owner != owner) {
                next('Pretended owner is not');
                return;
              }
              if (!owning.transaction) {
                next('Coin matches owner, but has no owning transaction while it should');
              } else if (owning.transaction != [tx.sender, tx.number].join('-')) {
                next('Coin matches owner, but has not good owning transaction');
              } else {
                nbConfirmations++;
                next();
              }
            },
          ], next);
        }
      ], function (err) {
        if (err)
          logger.warn(err);
        callback();
      });
    }, function(err){
      if (err)
        logger.error(err);
      done(null, nbConfirmations >= wallet.requiredTrusts);
    });
  }

  function getAllPeersButSelfAnd (fingerprint, done) {
    Peer.allBut([that.cert.fingerprint, fingerprint], done);
  };

  function getAllPeers (done) {
    Peer.allBut([that.cert.fingerprint], done);
  };

  // TODO
  function getVotingPeers (done) {
    getAllPeers(done);
  };

  function getForwardPeers (done) {
    async.waterfall([
      async.apply(Forward.find.bind(Forward), { to: that.cert.fingerprint }),
      function (fwds, next) {
        var fingerprints = _(fwds).map(function(fwd){ return fwd.fingerprint; });
        Peer.getList(fingerprints, next);
      }
    ], done);
  };
};

util.inherits(PeeringService, events.EventEmitter);

module.exports.get = function (pgp, currency, conf) {
  return new PeeringService(pgp, currency, conf);
};
