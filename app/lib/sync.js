var async       = require('async');
var _           = require('underscore');
var sha1        = require('sha1');
var merkle      = require('merkle');
var vucoin      = require('vucoin');
var jpgp        = require('./jpgp');
var logger      = require('./logger')('sync');

var CONST_FORCE_TX_PROCESSING = false;

module.exports = function Synchroniser (server, host, port, authenticated, conf) {
  var that = this;

  // Services
  var KeyService         = null;
  var VoteService        = null;
  var TransactionService = null;
  var WalletService      = null;
  var PeeringService     = null;
  var StrategyService    = null;
  var ParametersService  = null;
  var SyncService        = null;

  // Models
  var Amendment   = server.conn.model('Amendment');
  var PublicKey   = server.conn.model('PublicKey');
  var Merkle      = server.conn.model('Merkle');
  var Key         = server.conn.model('Key');
  var Membership  = server.conn.model('Membership');
  var Voting      = server.conn.model('Voting');
  var Transaction = server.conn.model('Transaction');
  var Wallet      = server.conn.model('Wallet');
  var Peer        = server.conn.model('Peer');
  
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
          node.network.peering.get(next);
        },
        function (json, next){
          remotePeer.copyValuesFrom(json);
          var entry = remotePeer.getRaw();
          var signature = remotePeer.signature;
          // Parameters
          if(!(entry && signature)){
            callback('Requires a peering entry + signature');
            return;
          }

          // Check signature's key ID
          var keyID = jpgp().signature(signature).issuer();
          if(!(keyID && keyID.length == 16)){
            callback('Cannot identify signature issuer`s keyID');
            return;
          }
          next(null, entry + signature, keyID);
        },
        function (signedPR, keyID, next) {
          var peer = new Peer();
          async.waterfall([
            function (next){
              peer.parse(signedPR, next);
            },
            function (peer, next){
              peer.verify(peer.currency, next);
            },
            function (verified, next) {
              server.initServer(next);
            },
            function (next){
              KeyService         = server.KeyService;
              VoteService        = server.VoteService;
              TransactionService = server.TransactionsService;
              WalletService      = server.WalletService;
              PeeringService     = server.PeeringService;
              StrategyService    = server.StrategyService;
              ParametersService  = server.ParametersService;
              SyncService        = server.SyncService;
              PeeringService.submit(peer, keyID, next);
            },
          ], function (err) {
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
                  async.waterfall([
                    function (cb){
                      node.pks.all({ "leaf": leaf}, cb);
                    },
                    function (json, cb){
                      hashes.push(leaf);
                      PublicKey.persistFromRaw(json.leaf.value.pubkey, function (err) {
                        cb();
                      });
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
            var toGetNumbers = _.range(number, 22 + 1);
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

        //=========
        // Wallets
        //=========
        function (next){
          Merkle.WalletEntries(next);
        },
        function (merkle, next) {
          node.network.wallet.get({}, function (err, json) {
            var rm = new NodesMerkle(json);
            if(rm.root() != merkle.root()){
              var leavesToAdd = [];
              node.network.wallet.get({ leaves: true }, function (err, json) {
                _(json.leaves).forEach(function(leaf){
                  if(merkle.leaves().indexOf(leaf) == -1){
                    leavesToAdd.push(leaf);
                  }
                });
                var hashes = [];
                async.forEachSeries(leavesToAdd, function(leaf, callback){
                  logger.info('Wallet entry %s', leaf);
                  async.waterfall([
                    function (cb){
                      node.network.wallet.get({ "leaf": leaf }, cb);
                    },
                    function (json, cb){
                      var jsonEntry = json.leaf.value.entry;
                      if (!jsonEntry.fingerprint) {
                        cb();
                        return;
                      }
                      var sign = json.leaf.value.signature;
                      var entry = new Wallet({});
                      ["version", "currency", "fingerprint", "hosters", "trusts"].forEach(function (key) {
                        entry[key] = jsonEntry[key];
                      });
                      entry.signature = sign;
                      WalletService.submit(entry, cb);
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
          node.network.peering.peers.get({}, function (err, json) {
            var rm = new NodesMerkle(json);
            if(rm.root() != merkle.root()){
              var leavesToAdd = [];
              node.network.peering.peers.get({ leaves: true }, function (err, json) {
                _(json.leaves).forEach(function(leaf){
                  if(merkle.leaves().indexOf(leaf) == -1){
                    leavesToAdd.push(leaf);
                  }
                });
                var hashes = [];
                async.forEachSeries(leavesToAdd, function(leaf, callback){
                  async.waterfall([
                    function (cb) {
                      node.network.peering.peers.get({ "leaf": leaf }, cb);
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
                    function (peer, keyID, cb){
                      logger.info('Peer 0x' + keyID);
                      PeeringService.submit(peer, keyID, function (err) {
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
                      node.registry.community.members.current(member.fingerprint, next);
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
                      node.registry.community.voters.current(member.fingerprint, next);
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
        syncTransactionTrees(node, keyFingerprint, Merkle.txOfSender.bind(Merkle), node.hdc.transactions.sender.get, next);
      },

      //==============
      // Received TXs
      //==============
      function (next){
        syncTransactionTrees(node, keyFingerprint, Merkle.txToRecipient.bind(Merkle), node.hdc.transactions.recipient, next);
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
          function (next) {
            remoteMerkleFunc(keyFingerprint, { leaves: true }, next);
          },
          function (json, onEveryTransactionProcessed){
            var transactions = {};
            async.forEachSeries(json.leaves, function(leaf, onSentTransactionsProcessed){
              var transaction;
              var signature;
              var raw;
              var i;
              async.waterfall([
                function (next){
                  remoteMerkleFunc(keyFingerprint, { leaf: leaf }, next);
                },
                function (json, next){
                  transaction = new Transaction(json.leaf.value.transaction);
                  signature = json.leaf.value.transaction.signature;
                  raw = json.leaf.value.transaction.raw;
                  i = 0;
                  next();
                },
                function (next){
                  async.whilst(
                    function (){ return i < transaction.coins.length; },
                    function (callback){
                      var coin = transaction.coins[i];
                      var parts = coin.split(':');
                      var txIssuer = parts[1] && parts[1].substring(0, 40);
                      async.waterfall([
                        function (next){
                          if(!txIssuer || txIssuer == keyFingerprint){
                            next(null, false);
                            return;
                          }
                          // Transaction of another key
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
                        function (pubkey, signedTx, txs, next) {
                          var tx = new Transaction();
                          tx.parse(signedTx, function (err, tx) {
                            next(err, pubkey, tx, txs);
                          });
                        },
                        function (pubkey, tx, txs, next){
                          if(txs.length == 0){
                            logger.info(tx.sender + '#' + tx.number);
                            TransactionService.processTx(tx, CONST_FORCE_TX_PROCESSING, next);
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
