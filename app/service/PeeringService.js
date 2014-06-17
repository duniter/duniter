var util        = require('util');
var jpgp        = require('../lib/jpgp');
var async       = require('async');
var request     = require('request');
var openpgp     = require('openpgp');
var _           = require('underscore');
var Status      = require('../models/statusMessage');
var events      = require('events');
var logger      = require('../lib/logger')('peering');

function PeeringService(conn, conf, PublicKeyService, ParametersService) {

  var currency = conf.currency;

  var Wallet      = conn.model('Wallet');
  var Amendment   = conn.model('Amendment');
  var PublicKey   = conn.model('PublicKey');
  var Transaction = conn.model('Transaction');
  var Merkle      = conn.model('Merkle');
  var Vote        = conn.model('Vote');
  var Peer        = conn.model('Peer');
  var Key         = conn.model('Key');
  var Forward     = conn.model('Forward');
  
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
    ], done);
  };

  this.submit = function(peering, callback){
    var peer = new Peer(peering);
    var pubkey = peer.pubkey;
    var fpr = pubkey.fingerprint;
    async.waterfall([
      // Looking for corresponding public key
      function(next){
        if(!peer.fingerprint.match(new RegExp(fpr + "$", "g"))){
          next('Fingerprint in peering entry ('+pubkey.fingerprint+') does not match signatory (' + fpr + ')');
          return;
        }
        that.addPeer(peer);
        next();
      },
      function (next){
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

  this.submitForward = function (obj, done) {
    var fwd = new Forward(obj);
    var pubkey;
    async.waterfall([
      function (next) {
        Peer.find({ fingerprint: fwd.from }, next);
      },
      function (peers, next) {
        if(peers.length == 0){
          errCode = 404;
          next('Peer ' + fwd.from + ' not found, POST at ucg/peering/peers first');
          return;
        }
        PublicKey.getTheOne(fwd.from, next);
      },
      function (pubkey, next){
        if(!fwd.to.match(new RegExp("^" + that.cert.fingerprint + "$", "g"))){
          next('Node\'s fingerprint ('+that.cert.fingerprint+') is not concerned by this forwarding (' + fwd.to + ')');
          return;
        }
        if(!fwd.from.match(new RegExp("^" + pubkey.fingerprint + "$", "g"))){
          next('Forwarder\'s fingerprint ('+fwd.from+') does not match signatory (' + pubkey.fingerprint + ')');
          return;
        }
        Forward.find({ from: fwd.from, to: that.cert.fingerprint }, next);
      },
      function (fwds, next){
        var fwdEntity = fwd;
        if(fwds.length > 0){
          // Already existing fwd
          fwdEntity = fwds[0];
          fwd.copyValues(fwdEntity);
        }
        fwdEntity.save(function (err) {
          next(err, fwdEntity);
        });
      }
    ], done);
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

  this.updateForwards = function (done) {
    async.waterfall([
      function (next){
        that.generateForward(next);
      },
      function (forward, next){
        Forward.findDifferingOf(that.cert.fingerprint, forward.getHashBasis(), next);
      },
      function (fwds, next){
        async.forEach(fwds, function(fwd, callback){
          async.waterfall([
            function (next){
              Peer.getTheOne(fwd.to, next);
            },function (peer, next){
              that.negociateForward(peer, next);
            },
          ], function (err) {
            err && logger.warn(err);
            callback();
          });
        }, next);
      },
    ], done);
  };

  /**
  * Generate the general forward this node should send to peers
  **/
  this.generateForward = function (peer, done) {
    if (arguments.length == 1) {
      done = peer;
      peer = undefined;
    }
    var forward = null;
    async.waterfall([
      function (next) {
        forward = new Forward({
          version: 1,
          currency: currency,
          from: that.cert.fingerprint,
          to: peer ? peer.fingerprint : that.cert.fingerprint,
          forward: 'ALL'
        });
        if(conf.kmanagement == 'KEYS'){
          Key.getManaged(function (err, keys) {
            var theKeys = [];
            keys.forEach(function(key){
              theKeys.push(key.fingerprint);
            });
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
        next(null, forward);
      }
    ], done);
  };

  this.negociateForward = function (peer, done) {
    var forward = null;
    async.waterfall([
      function (next) {
        if(peer.fingerprint == that.cert.fingerprint){
          next('Cannot negociate Forward with self node');
          return;
        }
        next();
      },
      function (next) {
        Forward.removeTheOne(that.cert.fingerprint, peer.fingerprint, next);
      },
      function (next) {
        that.generateForward(peer, next);
      },
      function (fwd, next) {
        forward = fwd;
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
        getRandomInAllPeers(function (err, peers) {
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

  this.propagatePeering = function (peering, done) {
    getAllPeersButSelfAnd(peering.fingerprint, function (err, peers) {
      that.emit('peer', peering, peers || []);
    });
  };

  this.propagateForward = function (forward, peer, done) {
    that.emit('forward', forward, [peer], done);
  };

  this.propagateVote = function (amendment, vote) {
    getVotingPeers(function (err, peers) {
      that.emit('vote', vote, peers || []);
    });
  };

  this.propagateMembership = function (membership, done) {
    getRandomInAllPeers(function (err, peers) {
      that.emit('membership', membership, peers || []);
    });
  };

  this.propagateVoting = function (voting, done) {
    getRandomInAllPeers(function (err, peers) {
      that.emit('voting', voting, peers || []);
    });
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

  function getRandomInAllPeers (done) {
    Peer.getRandomlyWithout([that.cert.fingerprint], done);
  };

  // TODO
  function getVotingPeers (done) {
    getRandomInAllPeers(done);
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

module.exports.get = function (conn, conf, PublicKeyService, ParametersService) {
  return new PeeringService(conn, conf, PublicKeyService, ParametersService);
};
