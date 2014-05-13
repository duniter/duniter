var async       = require('async');
var mongoose    = require('mongoose');
var _           = require('underscore');
var sha1        = require('sha1');
var merkle      = require('merkle');
var Amendment   = mongoose.model('Amendment');
var PublicKey   = mongoose.model('PublicKey');
var Merkle      = mongoose.model('Merkle');
var Key         = mongoose.model('Key');
var Membership  = mongoose.model('Membership');
var Voting      = mongoose.model('Voting');
var Transaction = mongoose.model('Transaction');
var Wallet      = mongoose.model('Wallet');
var Peer        = mongoose.model('Peer');
var vucoin      = require('vucoin');
var logger      = require('./logger')('sync');
var service     = require('../service');

var CONST_FORCE_TX_PROCESSING = false;

// Services
var KeyService         = service.Key;
var VoteService        = service.Vote;
var TransactionService = service.Transactions;
var WalletService         = service.Wallet;
var PeeringService     = service.Peering;
var StrategyService    = service.Strategy;
var ParametersService  = service.Parameters;
var SyncService        = service.Sync;

module.exports = function Synchroniser (host, port, authenticated, currency, conf) {
  var that = this;
  
  this.remoteFingerprint = null;

  this.sync = function (done) {
    logger.info('Connecting remote host...');
    vucoin(host, port, authenticated, function (err, node) {
      if(err){
        done('Cannot sync: ' + err);
        return;
      }

      // Global sync vars
      var remotePeer = new Peer({});
      var amendments = {};
      var remoteCurrentNumber;

      async.waterfall([
        function (next){
          logger.info('Sync started.');
          next();
        },

        //============
        // Peer
        //============
        function (next){
          node.ucg.peering.get(next);
        },
        function (json, next){
          remotePeer.copyValuesFrom(json);
          ParametersService.getPeeringEntryFromRaw(remotePeer.getRaw(), remotePeer.signature, next);
        },
        function (signedPR, pubkey, next) {
          async.waterfall([
            function (next){
              Peer.find({ fingerprint: remotePeer.fingerprint, hash: sha1(signedPR).toUpperCase() }, next);
            },
            function (peers, next){
              if(peers.length > 0){
                next('Peer already saved', peers[0]);
                return;
              }
              next();
            },
            function (next){
              PeeringService.submit(signedPR, pubkey, next);
            },
          ], function (err, peer) {
            if(err && !peer){
              next(err);
              return;
            }
            next(null, peer);
          });
        },
        function (recordedPR, next){
          that.remoteFingerprint = recordedPR.fingerprint;
          next();
        },

        //============
        // Public Keys
        //============
        function (next){
          Merkle.forPublicKeys(next);
        },
        function (merkle, next) {
          node.pks.all({}, function (err, json) {
            var rm = new NodesMerkle(json);
            if(rm.root() != merkle.root()){
              var leavesToAdd = [];
              // Call with nice no to have PGP error 'gpg: input line longer than 19995 characters'
              node.pks.all({ leaves: true, nice: true }, function (err, json) {
                _(json.leaves).forEach(function(leaf){
                  if(merkle.leaves().indexOf(leaf) == -1){
                    leavesToAdd.push(leaf);
                  }
                });
                var hashes = [];
                async.forEachSeries(leavesToAdd, function(leaf, callback){
                  logger.info('Importing public key %s...', leaf);
                  var keytext, keysign;
                  async.waterfall([
                    function (cb){
                      node.pks.all({ "leaf": leaf}, cb);
                    },
                    function (json, cb){
                      keytext = json.leaf.value.pubkey;
                      keysign = json.leaf.value.signature;
                      PublicKey.verify(keytext, keysign, cb);
                    },
                    function (verified, cb){
                      if(!verified){
                        cb('Key was not verified by its signature');
                        return;
                      }
                      hashes.push(leaf);
                      PublicKey.persistFromRaw(keytext, keysign, cb);
                    },
                    function (next) {
                      KeyService.handleKey(leaf, conf && conf.kmanagement == 'ALL', next);
                    },
                  ], callback);
                }, function(err, result){
                  next(err);
                });
              });
            }
            else next();
          });
        },

        //============
        // Amendments
        //============
        function (next){
          Amendment.nextNumber(next);
        },
        function (number, next) {
          node.hdc.amendments.current(function (err, json) {
            if(err){
              logger.warn('Issue getting current:');
              err.split('\n').forEach(function (msg) {
                logger.warn(msg);
              });
              next();
              return;
            }
            remoteCurrentNumber = parseInt(json.number);
            amendments[remoteCurrentNumber] = json.raw;
            var toGetNumbers = _.range(number, remoteCurrentNumber + 1);
            async.forEachSeries(toGetNumbers, function(amNumber, callback){
              async.waterfall([
                function (cb){
                  if(!amendments[amNumber])
                    node.hdc.amendments.promoted(amNumber, cb);
                  else
                    cb(null, { raw: amendments[amNumber] });
                },
                function (am, cb){
                  amendments[amNumber] = am.raw;
                  node.hdc.amendments.promoted(amNumber, cb);
                },
                function (am, cb){
                  amendments[amNumber] = am.raw;
                  cb();
                },
                function (cb) {
                  node.hdc.amendments.view.signatures(amNumber, sha1(amendments[amNumber]).toUpperCase(), { leaves: true }, cb);
                },
                function (json, cb){
                  applyVotes(amendments, amNumber, number, json, node, cb);
                }
              ], function (err, result) {
                callback(err);
              });
            }, function(err, result){
              next(err);
            });
          });
        },

        //==============
        // Transactions
        //==============
        function (next){
          Key.find({ managed: true }, next);
        },
        function (keys, next) {
          async.forEachSeries(keys, function (key, onKeyDone) {
            syncTransactionsOfKey(node, key.fingerprint, onKeyDone);
          }, next);
        },

        //==================
        // Trust Hash Table
        //==================
        function (next){
          Merkle.WalletEntries(next);
        },
        function (merkle, next) {
          node.ucg.tht.get({}, function (err, json) {
            var rm = new NodesMerkle(json);
            if(rm.root() != merkle.root()){
              var leavesToAdd = [];
              node.ucg.tht.get({ leaves: true }, function (err, json) {
                _(json.leaves).forEach(function(leaf){
                  if(merkle.leaves().indexOf(leaf) == -1){
                    leavesToAdd.push(leaf);
                  }
                });
                var hashes = [];
                async.forEachSeries(leavesToAdd, function(leaf, callback){
                  async.waterfall([
                    function (cb){
                      node.ucg.tht.get({ "leaf": leaf }, cb);
                    },
                    function (json, cb){
                      var jsonEntry = json.leaf.value.entry;
                      var sign = json.leaf.value.signature;
                      var entry = new Wallet({});
                      ["version", "currency", "fingerprint", "hosters", "trusts"].forEach(function (key) {
                        entry[key] = jsonEntry[key];
                      });
                      logger.info('Wallet entry %s', jsonEntry.fingerprint);
                      WalletService.submit(entry.getRaw() + sign, cb);
                    }
                  ], callback);
                }, function(err, result){
                  next(err);
                });
              });
            }
            else next();
          });
        },

        //=======
        // Peers
        //=======
        function (next){
          Merkle.peers(next);
        },
        function (merkle, next) {
          node.ucg.peering.peers.get({}, function (err, json) {
            var rm = new NodesMerkle(json);
            if(rm.root() != merkle.root()){
              var leavesToAdd = [];
              node.ucg.peering.peers.get({ leaves: true }, function (err, json) {
                _(json.leaves).forEach(function(leaf){
                  if(merkle.leaves().indexOf(leaf) == -1){
                    leavesToAdd.push(leaf);
                  }
                });
                var hashes = [];
                async.forEachSeries(leavesToAdd, function(leaf, callback){
                  async.waterfall([
                    function (cb) {
                      node.ucg.peering.peers.get({ "leaf": leaf }, cb);
                    },
                    function (json, cb) {
                      var jsonEntry = json.leaf.value;
                      var sign = json.leaf.value.signature;
                      var entry = new Peer({});
                      ["version", "currency", "fingerprint", "endpoints"].forEach(function (key) {
                        entry[key] = jsonEntry[key];
                      });
                      entry.signature = sign;
                      ParametersService.getPeeringEntryFromRaw(entry.getRaw(), sign, cb);
                    },
                    function (rawSigned, keyID, cb){
                      logger.info('Peer 0x' + keyID);
                      PeeringService.submit(rawSigned, keyID, function (err) {
                        cb();
                      });
                    }
                  ], callback);
                }, function(err, result){
                  next(err);
                });
              });
            }
            else next();
          });
        },

        //===========
        // Registry
        //===========
        function (next){
          Amendment.current(function (err, am) {
            if (!am) {
              next();
              return;
            }
            async.waterfall([
              function (next){
                Key.getMembers(next);
              },
              function (keys, next) {
                async.forEach(keys, function(member, callback){
                  async.waterfall([
                    function (next){
                      node.ucs.community.members.current(member.fingerprint, next);
                    },
                    function (jsonMS, next){
                      logger.info('Membership of %s', member.fingerprint);
                      var ms = new Membership({
                        "version": jsonMS.membership.version,
                        "currency": jsonMS.membership.currency,
                        "issuer": jsonMS.membership.issuer,
                        "membership": jsonMS.membership.membership,
                        "date": new Date(jsonMS.membership.date*1000),
                        "type": "MEMBERSHIP"
                      });
                      ms.signature = jsonMS.signature;
                      ParametersService.getMembership({
                        body: {
                          membership: ms.getRaw(),
                          signature: jsonMS.signature
                        }
                      }, next);
                    },
                    function (ms, next){
                      ms.amNumber = am.number - 1;
                      ms.current = true;
                      ms.save(function (err) {
                        next(err);
                      });
                    },
                  ], callback);
                }, next);
              },
              function (next){
                Key.getVoters(next);
              },
              function (keys, next) {
                async.forEach(keys, function(member, callback){
                  async.waterfall([
                    function (next){
                      node.ucs.community.voters.current(member.fingerprint, next);
                    },
                    function (jsonVT, next){
                      logger.info('Voting of %s', member.fingerprint);
                      var vt = new Voting({
                        "version": jsonVT.voting.version,
                        "currency": jsonVT.voting.currency,
                        "issuer": jsonVT.voting.issuer,
                        "date": new Date(jsonVT.voting.date*1000),
                        "type": "VOTING"
                      });
                      vt.signature = jsonVT.signature;
                      ParametersService.getVoting({
                        body: {
                          voting: vt.getRaw(),
                          signature: jsonVT.signature
                        }
                      }, next);
                    },
                    function (voting, next){
                      voting.amNumber = am.number - 1;
                      voting.current = true;
                      voting.save(function (err) {
                        next(err);
                      });
                    },
                  ], callback);
                }, next);
              },
            ], next);
          })
        },
      ], function (err, result) {
        logger.info('Sync finished.');
        done(err);
      });
    })
  }

  var alreadyDone = [];

  function syncTransactionsOfKey (node, keyFingerprint, onKeyDone) {
    if(~alreadyDone.indexOf(keyFingerprint)){
      onKeyDone();
      return;
    }
    logger.info('Transactions of %s...', keyFingerprint);
    async.waterfall([

      //==============
      // Sent TXs
      //==============
      function (next){
        syncTransactionTrees(node, keyFingerprint, Merkle.txOfSender, node.hdc.transactions.sender.get, next);
      },

      //==============
      // Received TXs
      //==============
      function (next){
        syncTransactionTrees(node, keyFingerprint, Merkle.txToRecipient, node.hdc.transactions.recipient, next);
      }
    ], function (err) {
      // Avoid to loop on already synced keys
      alreadyDone.push(keyFingerprint);
      onKeyDone(err);
    });
  }

  function syncTransactionTrees (node, keyFingerprint, localMerkleFunc, remoteMerkleFunc, onceSyncFinished) {
    async.waterfall([
      function (onRootsGotten){
        async.parallel({
          local: function(cb){
            localMerkleFunc.call(localMerkleFunc, keyFingerprint, cb);
          },
          remote: function(cb){
            remoteMerkleFunc.call(remoteMerkleFunc, keyFingerprint, {}, cb);
          }
        }, onRootsGotten);
      },
      function (results, onKeySentTransactionFinished){
        var rm = new NodesMerkle(results.remote);
        if(results.local.root() == rm.root()){
          onKeySentTransactionFinished();
          return;
        }
        async.waterfall([
          function (onEveryTransactionProcessed){
            var json = results.remote;
            var transactions = {};
            var numbers = _.range(json.leavesCount);
            async.forEachSeries(numbers, function(number, onSentTransactionsProcessed){
              var transaction;
              var signature;
              var raw;
              var i;
              async.waterfall([
                function (next){
                  node.hdc.transactions.view(keyFingerprint, number, next);
                },
                function (json, next){
                  transaction = json.transaction;
                  signature = json.signature;
                  raw = json.raw;
                  i = 0;
                  next();
                },
                function (next){
                  async.whilst(
                    function (){ return transaction.type != 'ISSUANCE' && i < transaction.coins.length; },
                    function (callback){
                      var coin = transaction.coins[i];
                      var txIssuer = coin.transaction_id.substring(0, 40);
                      async.waterfall([
                        function (next){
                          if(txIssuer == keyFingerprint){
                            next(null, false);
                            return;
                          }
                          Key.isManaged(txIssuer, next);
                        },
                        function  (isOtherManagedKey, next) {
                          if(isOtherManagedKey){
                            syncTransactionsOfKey(node, txIssuer, next);
                            return;
                          }
                          next();
                        }
                      ], function (err) {
                        i++;
                        callback(err);
                      });
                    },
                    function (err) {
                      async.waterfall([
                        function (next){
                          ParametersService.getTransactionFromRaw(raw, signature, next);
                        },
                        function (pubkey, signedTx, next) {
                          Transaction.find({ sender: transaction.sender, number: transaction.number }, function (err, txs) {
                            next(err, pubkey, signedTx, txs);
                          });
                        },
                        function (pubkey, signedTx, txs, next){
                          if(txs.length == 0){
                            logger.info(transaction.sender, transaction.number);
                            TransactionService.processTx(pubkey, signedTx, CONST_FORCE_TX_PROCESSING, next);
                            return;
                          }
                          next();
                        }
                      ], next);
                    }
                  );
                },
              ], onSentTransactionsProcessed);
            }, onEveryTransactionProcessed);
          }
        ], onKeySentTransactionFinished);
      }
    ], onceSyncFinished);
  }

  function applyVotes(amendments, amNumber, number, json, node, cb) {
    logger.info('Applying votes for amendment #%s', amNumber);
    logger.info("Signatures: %s", _(json.leaves).size());
    async.forEachSeries(json.leaves, function(leaf, callback){
      async.waterfall([
        function (next){
          var hash = sha1(amendments[amNumber]).toUpperCase();
          node.hdc.amendments.view.signatures(amNumber, hash, { "leaf": leaf }, next);
        },
        function (json, next){
          var vote = json.leaf;
          ParametersService.getVote({
            body: {
              amendment: amendments[amNumber],
              signature: vote.value.signature
            }
          }, next);
        },
        function (vote, next){
          VoteService.submit(vote, function (err, am) {
            if(!err)
              number++;
            next(err);
          });
          // VoteService.submit(amendments[amNumber] + vote.value.signature, function (err, am) {
          //   // Promotion time
          //   StrategyService.tryToPromote(am, function (err) {
          //     if(!err)
          //       number++;
          //     next(err);
          //   });
          // });
        }
      ], callback);
    }, function(err, result){
      cb(err, number);
    });
  }
}

function NodesMerkle (json) {
  
  var that = this;
  var merkleRoot = null;
  ["depth", "nodesCount", "leavesCount"].forEach(function (key) {
    that[key] = json[key];
  });

  this.merkleRoot = json["root"];

  // var i = 0;
  // this.levels = [];
  // while(json && json.levels[i]){
  //   this.levels.push(json.levels[i]);
  //   i++;
  // }

  this.root = function () {
    return this.merkleRoot;
  }
}
