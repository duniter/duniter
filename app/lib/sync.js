var async            = require('async');
var _                = require('underscore');
var sha1             = require('sha1');
var merkle           = require('merkle');
var vucoin           = require('vucoin');
var eventStream      = require('event-stream');
var inquirer         = require('inquirer');
var jpgp             = require('./jpgp');
var unix2dos         = require('./unix2dos');
var parsers          = require('./streams/parsers/doc');
var extractSignature = require('./streams/extractSignature');
var logger           = require('./logger')('sync');

var CONST_FORCE_TX_PROCESSING = false;

module.exports = function Synchroniser (server, host, port, authenticated, conf) {
  var that = this;

  // Services
  var PublicKeyService   = server.PublicKeyService;
  var KeyService         = server.KeyService;
  var TransactionService = server.TransactionsService;
  var WalletService      = server.WalletService;
  var PeeringService     = server.PeeringService;
  var ParametersService  = server.ParametersService;
  var KeychainService    = server.KeychainService;

  // Models
  var PublicKey     = server.conn.model('PublicKey');
  var KeyBlock      = server.conn.model('KeyBlock');
  var Merkle        = server.conn.model('Merkle');
  var Key           = server.conn.model('Key');
  var Membership    = server.conn.model('Membership');
  var Transaction   = server.conn.model('Transaction');
  var Wallet        = server.conn.model('Wallet');
  var Peer          = server.conn.model('Peer');
  var Configuration = server.conn.model('Configuration');
  
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
      var remotePubkey;

      async.waterfall([
        function (next){
          logger.info('Sync started.');
          next();
        },

        //============
        // Pubkey
        //============
        function (next){
          node.network.pubkey(next);
        },
        function (pubkey, next){
          var parser = parsers.parsePubkey();
          parser.end(unix2dos(pubkey));
          parser.on('readable', function () {
            var parsed = parser.read();
            PublicKeyService.submitPubkey(parsed, next);
          });
        },
        function (pubkey, next){
          choose("Remote key is 0x" + pubkey.fingerprint + ", should this key be trusted for the sync session?", true,
            function trust () {
              next(null, pubkey);
            },
            function doNotTrust () {
              next('You chose not to trust remote\'s pubkey, sync cannot continue');
            });
        },

        //============
        // Peer
        //============
        function (pubkey, next){
          remotePubkey = pubkey;
          node.network.peering.get(next);
        },
        function (json, next){
          remotePeer.copyValuesFrom(json);
          var entry = remotePeer.getRaw();
          var signature = unix2dos(remotePeer.signature);
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
          var peer;
          async.waterfall([
            function (next){
              parsers.parsePeer(next).asyncWrite(signedPR, next);
            },
            function (obj, next) {
              obj.pubkey = remotePubkey;
              peer = obj;
              // Temporarily manage ALL keys for sync
              server.conf.kmanagement = "ALL";
              PeeringService.submit(peer, next);
            },
          ], function (err) {
            next(err, peer);
          });
        },
        function (recordedPR, next){
          that.remoteFingerprint = recordedPR.fingerprint;
          next();
        },

        //============
        // Parameters
        //============
        function (next){
          node.keychain.parameters(next);
        },
        function (params, next){
          conf.currency    = params["currency"];
          conf.sigDelay    = params["sigDelay"];
          conf.sigValidity = params["sigValidity"];
          conf.sigQty      = params["sigQty"];
          conf.stepMax     = params["stepMax"];
          conf.powZeroMin  = params["powZeroMin"];
          conf.powPeriod   = params["powPeriod"];
          conf.save(function (err) {
            next(err);
          });
        },

        //============
        // Public Keys
        //============
        // function (next){
        //   Merkle.forPublicKeys(next);
        // },
        // function (merkle, next) {
        //   node.pks.all({}, function (err, json) {
        //     var rm = new NodesMerkle(json);
        //     if(rm.root() != merkle.root()){
        //       var leavesToAdd = [];
        //       // Call with nice no to have PGP error 'gpg: input line longer than 19995 characters'
        //       node.pks.all({ leaves: true, nice: true }, function (err, json) {
        //         _(json.leaves).forEach(function(leaf){
        //           if(merkle.leaves().indexOf(leaf) == -1){
        //             leavesToAdd.push(leaf);
        //           }
        //         });
        //         var hashes = [];
        //         async.forEachSeries(leavesToAdd, function(leaf, callback){
        //           logger.info('Importing public key %s...', leaf);
        //           async.waterfall([
        //             function (cb){
        //               node.pks.all({ "leaf": leaf}, cb);
        //             },
        //             function (json, cb){
        //               hashes.push(leaf);
        //               PublicKey.persistFromRaw(json.leaf.value.pubkey, function (err) {
        //                 cb();
        //               });
        //             },
        //             function (next) {
        //               KeyService.handleKey(leaf, conf && conf.kmanagement == 'ALL', next);
        //             },
        //           ], callback);
        //         }, function(err, result){
        //           next(err);
        //         });
        //       });
        //     }
        //     else next();
        //   });
        // },

        //============
        // Keychain
        //============
        function (next){
          node.keychain.current(next);
        },
        function (current, next) {
          KeychainService.checkWithLocalTimestamp = false;
          var numbers = _.range(current.number + 1);
          async.forEachSeries(numbers, function(number, callback){
            async.waterfall([
              function (next){
                node.keychain.keyblock(number, next);
              },
              function (keyblock, next){
                var block = new KeyBlock(keyblock);
                console.log('keyblock#' + block.number, sha1(block.getRawSigned()));
                var keyID = jpgp().signature(block.signature).issuer();
                var newPubkeys = block.getNewPubkeys();
                // Save pubkeys + block
                async.waterfall([
                  function (next){
                    if (block.number == 0) {
                      var signatory = null;
                      newPubkeys.forEach(function(key){
                        if (key.hasSubkey(keyID))
                          signatory = key;
                      });
                      if (!signatory) {
                        next('Root block signatory not found');
                        return;
                      }
                      next(null, { fingerprint: signatory.getFingerprint(), raw: signatory.getArmored() });
                    } else {
                      PublicKey.getTheOne(keyID, next);
                    }
                  },
                  function (pubkey, next){
                    keyblock.pubkey = pubkey;
                    jpgp()
                      .publicKey(pubkey.raw)
                      .data(block.getRaw())
                      .signature(block.signature)
                      .verify(next);
                  },
                  function (verified, next){
                    async.forEach(newPubkeys, function(newPubkey, callback){
                      async.waterfall([
                        function (next){
                          parsers.parsePubkey(callback).asyncWrite(unix2dos(newPubkey.getArmored()), next);
                        },
                        function (obj, next){
                          PublicKeyService.submitPubkey(obj, next);
                        },
                      ], callback);
                    }, next);
                  },
                  function (next){
                    KeychainService.submitKeyBlock(keyblock, next);
                  },
                ], next);
              },
            ], callback);
          }, next)
        },

        //==============
        // Transactions
        //==============
        // function (next){
        //   Key.find({ managed: true }, next);
        // },
        // function (keys, next) {
        //   async.forEachSeries(keys, function (key, onKeyDone) {
        //     syncTransactionsOfKey(node, key.fingerprint, onKeyDone);
        //   }, next);
        // },

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
                      var entry = {};
                      ["version", "currency", "fingerprint", "hosters", "trusts"].forEach(function (key) {
                        entry[key] = jsonEntry[key];
                      });
                      entry.signature = sign;
                      entry.pubkey = { fingerprint: entry.fingerprint };
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
                      var entry = {};
                      ["version", "currency", "fingerprint", "endpoints"].forEach(function (key) {
                        entry[key] = jsonEntry[key];
                      });
                      entry.signature = sign;
                      entry.pubkey = { fingerprint: entry.fingerprint };
                      logger.info('Peer 0x' + peer.fingerprint);
                      PeeringService.submit(peer, function (err) {
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
                          parsers.parseTransaction(next).asyncWrite(signedTx, function (err, obj) {
                            var tx = obj || {};
                            tx.pubkey = { fingerprint: tx.sender };
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

function choose (question, defaultValue, ifOK, ifNotOK) {
  inquirer.prompt([{
    type: "confirm",
    name: "q",
    message: question,
    default: defaultValue,
  }], function (answer) {
    answer.q ? ifOK() : ifNotOK();
  });
}
