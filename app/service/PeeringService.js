var util        = require('util');
var jpgp        = require('../lib/jpgp');
var async       = require('async');
var request     = require('request');
var mongoose    = require('mongoose');
var openpgp     = require('openpgp');
var _           = require('underscore');
var THTEntry    = mongoose.model('THTEntry');
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
        peer.setStatus(status.status, next);
        peer.statusSigDate = status.sigDate;
        peers[peer.fingerprint].status = status;
      }
    ], function (err) {
      callback(err, status, peer, wasStatus);
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

  this.initKeys = function (done) {
    var manual = conf.kmanagement == 'KEYS';
    if(manual){
      done();
      return;
    }
    var thtKeys = [];
    var managedKeys = [];
    async.waterfall([
      function (next){
        Key.find({ managed: true }, next);
      },
      function (keys, next) {
        keys.forEach(function (k) {
          managedKeys.push(k.fingerprint);
        });
        next();
      },
      function (next) {
        THTEntry.find({}, next);
      },
      function (entries, next) {
        entries.forEach(function (e) {
          thtKeys.push(e.fingerprint);
        });
        next();
      },
      function (next) {
        // Entries from THT not present in managedKeys
        var notManaged = _(thtKeys).difference(managedKeys) || [];
        next(null, notManaged);
      },
      function (notManaged, next) {
        async.forEachSeries(notManaged, function (key, callback) {
          logger.debug('Add %s to managed keys...', key);
          Key.setManaged(key, true, callback);
        }, next);
      }
    ], function (err) {
      logger.debug('Managed keys updated.');
      done();
    });
  }

  /**
  * initForwards : look THT entries to deduce the forward rules of the node.
  * Two cases:
  *
  *   - keys: send forwards containing the keys managed by the node
  *   - all : send forwards asking to be forwarded ALL transactions
  **/
  this.initForwards = function (done, filterKeys) {
    if(conf.kmanagement == 'KEYS'){
      that.initForKeys(done, filterKeys);
    }
    else{
      that.initForAll(done, filterKeys);
    }
  }

  this.initForAll = function (done, filterKeys) {
    /**
    * Forward: ALL
    * Send simple ALL forward to every known peer
    */
    async.waterfall([
      function (next){
        // Look for registered peers
        if(filterKeys)
          Peer.find({ fingerprint: { $in: filterKeys }}, next);
        else
          Peer.find({}, next);
      },
      function (peers, next) {
        // For each peer
        async.forEachSeries(peers, function(peer, callback){
          var forward;
          async.waterfall([
            function (next) {
              if(peer.fingerprint == that.cert.fingerprint){
                next('Peer ' + peer.fingerprint + ' : self');
                return;
              }
              next();
            },
            function (next) {
              // Check wether it has already sent FWD rule
              Forward.getTheOne(this.cert.fingerprint, peer.fingerprint, next);
            },
            function (fwd, next) {
              // Already sent: skip FWD regnegociation for this peer
              if(fwd.forward == 'ALL'){
                next('Peer ' + peer.fingerprint + ' : forward already sent');
                return;
              }
              // Not sent yet: FWD regnegociation
              if(fwd._id){
                fwd.remove(function (err) {
                  next(err);
                });
                return;
              }
              next();
            },
            function (next) {
              forward = new Forward({
                version: 1,
                currency: currency,
                from: that.cert.fingerprint,
                to: peer.fingerprint,
                forward: 'ALL'
              });
              jpgp().sign(forward.getRaw(), that.privateKey, function (err, signature) {
                next(err, peer, forward.getRaw(), signature);
              });
            },
            function (peer, rawForward, signature, next) {
              that.initKeysSendForward(peer, rawForward, signature, next);
            },
            function (next) {
              forward.save(next);
            }
          ], function (err) {
            callback();
          });
        }, next);
      }
    ], done);
  }

  this.initForKeys = function (done, filterKeys) {
    /**
    * Forward: KEYS
    * Send forwards only to concerned hosts
    */
    var keysByPeer = {};
    async.waterfall([
      function (next){
        if(filterKeys)
          Key.find({ managed: true, fingerprint: { $in: filterKeys } }, next);
        else
          Key.find({ managed: true }, next);
      },
      function (keys, next) {
        async.forEachSeries(keys, function (k, callback) {
          THTEntry.getTheOne(k.fingerprint, function (err, entry) {
            if(err){
              callback();
              return;
            }
            entry.hosters.forEach(function (peer) {
              keysByPeer[peer] = keysByPeer[peer] || [];
              keysByPeer[peer].push(k.fingerprint);
            });
            callback();
          });
        }, function (err) {
          async.forEach(_(keysByPeer).keys(), function(peerFPR, callback){
            var forward, peer;
            async.waterfall([
              function (next) {
                if(peerFPR == that.cert.fingerprint){
                  next('Peer ' + peerFPR + ' : self');
                  return;
                }
                next();
              },
              function (next){
                Peer.find({ fingerprint: peerFPR }, next);
              },
              function (peers, next) {
                if(peers.length < 1){
                  next('Peer ' + peerFPR + ' : unknow yet');
                  return;
                }
                peer = peers[0];
                next();
              },
              function (next) {
                Forward.getTheOne(this.cert.fingerprint, peerFPR, next);
              },
              function (fwd, next) {
                if(fwd.forward == 'KEYS' && _(keysByPeer[peerFPR]).difference(fwd.keys).length == 0){
                  next('Peer ' + peerFPR + ' : forward already sent');
                  return;
                }
                if(fwd._id){
                  fwd.remove(function (err) {
                    next(err);
                  });
                  return;
                }
                next();
              },
              function (next) {
                forward = new Forward({
                  version: 1,
                  currency: currency,
                  from: that.cert.fingerprint,
                  to: peer.fingerprint,
                  forward: 'KEYS',
                  keys: keysByPeer[peerFPR]
                });
                jpgp().sign(forward.getRaw(), that.privateKey, function (err, signature) {
                  next(err, peer, forward.getRaw(), signature);
                });
              },
              function (peer, rawForward, signature, next) {
                that.initKeysSendForward(peer, rawForward, signature, next);
              },
              function (next) {
                forward.save(next);
              },
            ], function (err) {
              callback();
            });
          }, next);
        });
      }
    ], done);
  }

  this.initKeysSendForward = function (peer, rawForward, signature, done) {
    sendForward(peer, rawForward, signature, function (err, res, body) {
      if(!err && res && res.statusCode && res.statusCode == 404){
        async.waterfall([
          function (next){
            Peer.find({ fingerprint: that.cert.fingerprint }, next);
          },
          function (peers, next) {
            if(peers.length == 0){
              next('Cannot send self-peering request: does not exist');
              return;
            }
            sendPeering(peer, peers[0], next);
          },
          function (res, body, next) {
            sendForward(peer, rawForward, signature, function (err, res, body) {
              next(err);
            });
          }
        ], done);
      }
      else if(!res) done('No HTTP result');
      else if(!res.statusCode) done('No HTTP result code');
      else done(err);
    });
  }

  this.propagateTHT = function (entry, done) {
    async.waterfall([
      function (next) {
        if(entry.propagated){
          next('THT entry for ' + entry.fingerprint + ' already propagated', true);
          return;
        }
        next();
      },
      function (next) {
        Peer.find({}, next);
      },
      function (peers, next) {
        that.emit('tht', entry, peers);
        next(null, true);
      }
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
                THTEntry.findMatchingTransaction(tx, next);
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
  * Send UP or NEW signal to gvien peers' fingerprints according to wether a
  * Forward was received (UP) or not (NEW).
  *
  */
  this.sendUpSignal = function (done, toFingerprints) {
    async.waterfall([
      function (next){
        // Get two list of peers: the ones which already sent FWD, and those which did not
        that.getKnownPeersBySentStatus(toFingerprints, next);
      },
      function (sentNothingPeers, sentNewPeers, sentUpPeers, next) {
        async.parallel({
          newPeers: function(callback){
            that.sendStatusTo('NEW', sentNothingPeers, callback);
          },
          knownPeers: function(callback){
            that.sendStatusTo('UP', _.union(sentNewPeers, sentUpPeers), callback);
          }
        }, function(err, results) {
          done(err);
        });
      }
    ], done);
  }

  this.getKnownPeersBySentStatus = function (toFingerprints, done) {
    if (arguments.length == 1) {
      done = toFingerprints;
      toFingerprints = undefined;
    }
    var newPeers = [];
    var upPeers = [];
    async.waterfall([
      function (next){
        if (toFingerprints) {
          Peer.find({
            statusSentPending: false,
            "fingerprint": { $ne: that.cert.fingerprint },
            $in: {
              "fingerprint": toFingerprints
            }
          }, next);
        } else {
          Peer.find({
            statusSentPending: false,
            "fingerprint": { $ne: that.cert.fingerprint }
          }, next);
        }
      },
      function (peers, next){
        var peersSent = {};
        _(Peer.status).keys().forEach(function(item){
          peersSent[item] = [];
        });
        peers.forEach(function(peer){
          peersSent[peer.statusSent].push(peer.fingerprint);
        });
        next(
          null,
          peersSent[Peer.status.NOTHING],
          peersSent[Peer.status.NEW],
          peersSent[Peer.status.UP]);
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
            that.emit('status', status, peers || []);
            next();
          }
        ], next);
      },
    ], done);
  }

  this.propagatePubkey = function (pubkey) {
    getForwardPeers(function (err, peers) {
      that.emit('pubkey', pubkey, peers || []);
    });
  };

  this.propagateVote = function (amendment, vote) {
    getForwardPeers(function (err, peers) {
      that.emit('vote', vote, peers || []);
    });
  };

  this.propagatePeering = function (peering, done) {
    getForwardPeers(function (err, peers) {
      that.emit('peer', peering, peers || []);
    });
  };

  this.propagateStatus = function (status, done) {
    getForwardPeers(function (err, peers) {
      that.emit('status', status, peers || []);
    });
  };

  this.propagateMembership = function (membership, done) {
    getForwardPeers(function (err, peers) {
      that.emit('membership', membership, peers || []);
    });
  };

  this.propagateVoting = function (voting, done) {
    getForwardPeers(function (err, peers) {
      that.emit('voting', voting, peers || []);
    });
  };

  this.helloToPeer = function (peer, done) {
    async.waterfall([
      function (next){
        // Send UP/NEW signal for receiving its FORWARD rules (this also send self peering infos)
        PeeringService.sendUpSignal(next, [recordedPR.fingerprint]);
      },
    ], function (err) {
      if (err) plogger.error(err);
    });
  }

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
