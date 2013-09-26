var jpgp        = require('../lib/jpgp');
var async       = require('async');
var request     = require('request');
var mongoose    = require('mongoose');
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

module.exports.get = function (pgp, currency, conf) {
  
  this.privateKey = pgp.keyring.privateKeys[0];
  this.ascciiPubkey = (pgp && pgp.keyring.privateKeys[0]) ? pgp.keyring.privateKeys[0].obj.extractPublicKey() : '';
  this.cert = this.ascciiPubkey ? jpgp().certificate(this.ascciiPubkey) : { fingerprint: '' };

  var ParametersService = require('./ParametersService');

  this.submit = function(signedPR, keyID, callback){
    var peer = new Peer();
    var that = this;
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
        next(null, pubkey.raw);
      },
      function (pubkey, next){
        that.persistPeering(signedPR, pubkey, next);
      }
    ], callback);
  }

  this.submitStatus = function(signedSR, callback){
    var status = new Status();
    var peer;
    var that = this;
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
      function (pubkey, next){
        Peer.getTheOne(pubkey.fingerprint, next);
      },
      function (theOne, next){
        peer = theOne;
        peer.setStatus(status.isUp() ? Peer.status.UP : Peer.status.DOWN, next);
      }
    ], function (err) {
      callback(err, status, peer);
    });
  }

  this.persistPeering = function (signedPR, pubkey, done) {
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
          if(peers[0].sigDate >= peerEntity.sigDate){
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
    var that = this;
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
          console.log('Add %s to managed keys...', key);
          Key.setManaged(key, true, that.cert.fingerprint, callback);
        }, next);
      }
    ], function (err) {
      console.log('Managed keys updated.');
      done();
    });
  }

  /**
  * initForwards : look THT entries to deduce the forward rules of the node.
  * Two cases:
  *
  *   - restricted case: send forwards containing the keys managed by the node
  *   - all case: send forwards asking to be forwarded ALL transactions
  **/
  this.initForwards = function (done, forKeys) {
    var restricted = conf.kmanagement == 'KEYS';
    var that = this;
    if(restricted){

      /**
      * Forward: KEYS
      * Send forwards only to concerned hosts
      */
      var keysByPeer = {};
      async.waterfall([
        function (next){
          if(forKeys)
            Key.find({ managed: true, fingerprint: { $in: forKeys } }, next);
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
                  if(fwd.forward == 'KEYS' && !forKeys && _(keysByPeer[peerFPR]).difference(fwd.keys).length == 0){
                    next('Peer ' + peerFPR + ' : forward already sent');
                    return;
                  }
                  if(fwd._id){
                    fwd.remove(next);
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
                      ], next);
                    }
                    else if(!res) next('No HTTP result');
                    else if(!res.statusCode) next('No HTTP result code');
                    else next(err);
                  });
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
    else{
      
      /**
      * Forward: ALL
      * Send simple ALL forward to every known peer
      */
      async.waterfall([
        function (next){
          if(forKeys)
            Peer.find({ fingerprint: { $in: forKeys }}, next);
          else
            Peer.find({}, next);
        },
        function (peers, next) {
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
                Forward.getTheOne(this.cert.fingerprint, peer.fingerprint, next);
              },
              function (fwd, next) {
                if(fwd.forward == 'ALL' && !forKeys){
                  next('Peer ' + peer.fingerprint + ' : forward already sent');
                  return;
                }
                if(fwd._id){
                  fwd.remove(next);
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
                    ], next);
                  }
                  else if(!res) next('No HTTP result');
                  else if(!res.statusCode) next('No HTTP result code');
                  else next(err);
                });
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
  }

  this.propagateTHT = function (req, done) {
    var that = this;
    var entry = new THTEntry();
    async.waterfall([
      function (next) {
        ParametersService.getTHTEntry(req, next);
      },
      function (signedEntry, next){
        entry.parse(signedEntry, next);
      },
      function (entry, next){
        entry.verify(currency, next);
      },
      function(verified, next){
        THTEntry.getTheOne(entry.fingerprint, next);
      },
      function (dbEntry, next) {
        if(dbEntry.hash != entry.hash){
          next('Cannot propagate THT entry: DB is not sync with posted entry (' + entry.fingerprint + ')');
          return;
        }
        entry = dbEntry;
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
        async.forEach(peers, function(peer, callback){
          if(peer.fingerprint == that.cert.fingerprint){
            callback();
            return;
          }
          sendTHT(peer, entry, callback);
        }, next);
      },
      function (next) {
        entry.propagated = true;
        entry.save(next);
      },
      function (entry, code, next) {
        next(null, entry.propagated);
      }
    ], done);
  }

  this.propagateTransaction = function (req, done) {
    var am = null;
    var pubkey = null;
    var that = this;
    async.waterfall([
      function (next){
        ParametersService.getTransaction(req, next);
      },
      function (extractedPubkey, signedTX, next) {
        var tx = new Transaction({});
        async.waterfall([
          function (next){
            tx.parse(signedTX, next);
          },
          function (tx, next){
            tx.verify(currency, next);
          },
          function (verified, next){
            if(verified){
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
                      async.forEach(_(fingerprints).uniq(), function(fpr, callback){
                        if(fpr == that.cert.fingerprint){
                          callback();
                          return;
                        }
                        async.waterfall([
                          function (next){
                            Peer.find({ fingerprint: fpr}, next);
                          },
                          function (peers, next){
                            if(peers.length > 0){
                              sendTransaction(peers[0], tx, next);
                            }
                            else next();
                          },
                        ], callback);
                      }, next);
                    },
                  ], next);
                },
              ], next);
            }
            else next('Transaction cannot be propagated as it is not valid');
          }
        ], next);
      }
    ], done);
  }

  this.submitSelfPeering = function(toPeer, done){
    var that = this;
    async.waterfall([
      function (next){
        Peer.getTheOne(that.cert.fingerprint, next);
      },
      function (peering, next){
        sendPeering(toPeer, peering, next);
      },
    ], done);
  }

  this.sendUpSignal = function (done) {
    var that = this;
    var forwardsFPRS = [];
    var othersFPRS = [];
    async.waterfall([
      function (next){
        Forward.find({ to: that.cert.fingerprint }, next);
      },
      function (fwds, next){
        fwds.forEach(function(fwd){
          forwardsFPRS.push(fwd.from);
        });
        next();
      },
      function (next){
        Peer.find({ fingerprint: { $nin: forwardsFPRS} }, next);
      },
      function (peers, next){
        peers.forEach(function(peer){
          othersFPRS.push(peer.fingerprint);
        });
        next();
      },
    ], function (err) {
      if(err){
        done(err);
        return;
      }
      async.parallel({
        forwardPeers: function(callback){
          that.sendStatusTo('UP', _(forwardsFPRS).without(that.cert.fingerprint), callback);
        },
        otherPeers: function(callback){
          that.sendStatusTo('NEW', _(othersFPRS).without(that.cert.fingerprint), callback);
        }
      },
      function(err, results) {
        done(err);
      });
    });
  }

  this.sendStatusTo = function (statusStr, fingerprints, done) {
    var that = this;
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
        async.forEach(fingerprints, function(fingerprint, callback){
          that.propagateToFingerprint(fingerprint, status, sendStatus, callback);
        }, next);
      }
    ], function (err) {
      done(err);
    });
  }

  this.propagatePubkey = function (pubkey) {
    this.propagate(pubkey, sendPubkey);
  }

  this.propagateMembership = function (membership) {
    this.propagate(membership, sendMembership);
  }

  this.propagateVote = function (amendment, vote) {
    amendment.signature = vote.signature;
    this.propagate(amendment, sendVote);
  }

  this.propagatePeering = function (peering) {
    this.propagate(peering, sendPeering);
  }

  this.propagate = function (obj, sendMethod, done) {
    var that = this;
    async.waterfall([
      function (next){
        Forward.find({ to: that.cert.fingerprint }, next);
      },
      function (fwds, next){
        async.forEach(fwds, function(fwd, callback){
          that.propagateToFingerprint(fwd.from, obj, sendMethod, callback);
        }, next);
      },
    ], function (err) {
      if(done) done(err);
    });
  }

  this.propagateToFingerprint = function (fpr, obj, sendMethod, done) {
    var that = this;
    async.waterfall([
      function (next){
        Peer.find({ fingerprint: fpr }, next);
      },
      function (peers, next){
        if(peers.length > 0){
          sendMethod.call(sendMethod, peers[0], obj, next);
        }
        else next();
      },
    ], function (err) {
      done();
    });
  }

  function sendPubkey(peer, pubkey, done) {
    console.log('POST pubkey to %s', peer.fingerprint);
    post(peer, '/pks/add', {
      "keytext": pubkey.getRaw(),
      "keysign": pubkey.signature
    }, done);
  }

  function sendMembership(peer, membership, done) {
    console.log('POST membership to %s', peer.fingerprint);
    post(peer, '/hdc/community/join', {
      "request": membership.getRaw(),
      "signature": membership.signature
    }, done);
  }

  function sendVote(peer, vote, done) {
    console.log('POST vote to %s', peer.fingerprint);
    post(peer, '/hdc/amendments/votes', {
      "amendment": vote.getRaw(),
      "signature": vote.signature
    }, done);
  }

  function sendTransaction(peer, transaction, done) {
    console.log('POST transaction to %s', peer.fingerprint);
    post(peer, '/hdc/transactions/process', {
      "transaction": transaction.getRaw(),
      "signature": transaction.signature
    }, done);
  }

  function sendTHT(peer, entry, done) {
    console.log('POST THT entry %s to %s', entry.fingerprint, peer.fingerprint);
    post(peer, '/ucg/tht', {
      "entry": entry.getRaw(),
      "signature": entry.signature
    }, done);
  }

  function sendPeering(toPeer, peer, done) {
    console.log('POST peering to %s', toPeer.fingerprint);
    post(toPeer, '/ucg/peering/peers', {
      "entry": peer.getRaw(),
      "signature": peer.signature
    }, done);
  }

  function sendForward(peer, rawForward, signature, done) {
    console.log('POST forward to %s', peer.fingerprint);
    post(peer, '/ucg/peering/forward', {
      "forward": rawForward,
      "signature": signature
    }, done);
  }

  function sendStatus(peer, status, done) {
    console.log('POST status %s to %s', status.status, peer.fingerprint);
    post(peer, '/ucg/peering/status', {
      "status": status.getRaw(),
      "signature": status.signature
    }, done);
  }

  function post(peer, url, data, done) {
    request
    .post('http://' + peer.getURL() + url, function (err, res, body) {
      peer.setStatus((err && Peer.status.DOWN) || Peer.status.UP, function (err) {
        done(err, res, body);
      });
    })
    .form(data);
  }

  function get(peer, url, done) {
    // console.log('GET http://' + peer.getURL() + url);
    request
    .get('http://' + peer.getURL() + url)
    .end(done);
  }

  return this;
}