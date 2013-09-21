var async       = require('async');
var mongoose    = require('mongoose');
var _           = require('underscore');
var sha1        = require('sha1');
var merkle      = require('merkle');
var Membership  = mongoose.model('Membership');
var Amendment   = mongoose.model('Amendment');
var PublicKey   = mongoose.model('PublicKey');
var Merkle      = mongoose.model('Merkle');
var Key         = mongoose.model('Key');
var Transaction = mongoose.model('Transaction');
var THTEntry    = mongoose.model('THTEntry');
var Peer        = mongoose.model('Peer');
var vucoin      = require('vucoin');

module.exports = function Synchroniser (host, port, authenticated, pgp, currency, conf) {

  var VoteService        = require('../service/VoteService')(currency);
  var MembershipService  = require('../service/MembershipService').get(currency);
  var TransactionService = require('../service/TransactionsService').get(currency);
  var THTService         = require('../service/THTService').get(currency);
  var PeeringService     = require('../service/PeeringService').get(pgp, currency, conf);
  var StrategyService    = require('../service/StrategyService')();
  var ParametersService  = require('../service/ParametersService');
  var that = this;

  this.sync = function (done) {
    console.log('Connecting remote host...');
    vucoin(host, port, authenticated, function (err, node) {
      if(err){
        done('Cannot sync: ' + err);
        return;
      }

      // Global sync vars
      var amendments = {};
      var remoteCurrentNumber;

      async.waterfall([
        function (next){
          console.log('Sync started.');
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
              var indexesToAdd = [];
              node.pks.all({ extract: true }, function (err, json) {
                _(json.leaves).keys().forEach(function(key){
                  var leaf = json.leaves[key];
                  if(merkle.leaves().indexOf(leaf.hash) == -1){
                    indexesToAdd.push(key);
                  }
                });
                var hashes = [];
                async.forEachSeries(indexesToAdd, function(index, callback){
                  console.log('Importing public key %s', json.leaves[index].hash);
                  var keytext = json.leaves[index].value.pubkey;
                  var keysign = json.leaves[index].value.signature;
                  async.waterfall([
                    function (cb){
                      PublicKey.verify(keytext, keysign, cb);
                    },
                    function (verified, cb){
                      if(!verified){
                        cb('Key was not verified by its signature');
                        return;
                      }
                      hashes.push(json.leaves[index].hash);
                      PublicKey.persistFromRaw(keytext, keysign, cb);
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

        //============
        // Amendments
        //============
        function (next){
          Amendment.nextNumber(next);
        },
        function (number, next) {
          node.hdc.amendments.current(function (err, json) {
            if(err){
              next();
              return;
            }
            remoteCurrentNumber = parseInt(json.number);
            amendments[remoteCurrentNumber] = json.raw;
            var toGetNumbers = _.range(number, remoteCurrentNumber);
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
                  node.hdc.amendments.promoted(amNumber + 1, cb);
                },
                function (am, cb){
                  amendments[amNumber + 1] = am.raw;
                  cb();
                },
                function (cb) {
                  applyMemberships(amendments, amNumber, node, cb);
                },
                function (cb) {
                  node.hdc.amendments.view.signatures(amNumber + 1, sha1(amendments[amNumber + 1]).toUpperCase(), { extract: true }, cb);
                },
                function (json, cb){
                  applyVotes(amendments, amNumber, number, json, node, cb);
                },
                function (nextNumber, cb) {
                  number = nextNumber;
                  cb();
                }
              ], function (err, result) {
                callback(err);
              });
            }, function(err, result){
              next(err, number);
            });
          });
        },
        function (number, next) {
          if(number == remoteCurrentNumber){
            // Synchronise remote's current
            async.waterfall([
              function (callback){
                applyMemberships(amendments, number, node, callback);
              },
              function (callback){
                node.hdc.community.votes({ extract: true }, callback);
              },
              function (json, callback) {
                applyVotes(amendments, number, number, json, node, callback);
              }
            ], function (err) {
              next(err);
            });
          }
          else next();
        },
        function (next) {
          node.hdc.community.memberships({ extract: true }, next);
        },
        function (json, next) {
          applyTargetedMemberships(json.leaves, function () { return true; }, next);
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
          Merkle.THTEntries(next);
        },
        function (merkle, next) {
          node.ucg.tht.get({}, function (err, json) {
            var rm = new NodesMerkle(json);
            if(rm.root() != merkle.root()){
              var indexesToAdd = [];
              node.ucg.tht.get({ extract: true }, function (err, json) {
                _(json.leaves).keys().forEach(function(key){
                  var leaf = json.leaves[key];
                  if(merkle.leaves().indexOf(leaf.hash) == -1){
                    indexesToAdd.push(key);
                  }
                });
                var hashes = [];
                async.forEachSeries(indexesToAdd, function(index, callback){
                  var jsonEntry = json.leaves[index].value.entry;
                  var sign = json.leaves[index].value.signature;
                  var entry = new THTEntry({});
                  ["version", "currency", "fingerprint", "hosters", "trusts"].forEach(function (key) {
                    entry[key] = jsonEntry[key];
                  });
                  async.waterfall([
                    function (cb){
                      console.log('THT entry %s', jsonEntry.fingerprint);
                      THTService.submit(entry.getRaw() + sign, cb);
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
              var indexesToAdd = [];
              node.ucg.peering.peers.get({ extract: true }, function (err, json) {
                _(json.leaves).keys().forEach(function(key){
                  var leaf = json.leaves[key];
                  if(merkle.leaves().indexOf(leaf.hash) == -1){
                    indexesToAdd.push(key);
                  }
                });
                var hashes = [];
                async.forEachSeries(indexesToAdd, function(index, callback){
                  var jsonEntry = json.leaves[index].value;
                  var sign = json.leaves[index].value.signature;
                  var entry = new Peer({});
                  ["version", "currency", "fingerprint", "dns", "ipv4", "ipv6", "port"].forEach(function (key) {
                    entry[key] = jsonEntry[key];
                  });
                  async.waterfall([
                    function (cb) {
                      ParametersService.getPeeringEntryFromRaw(entry.getRaw(), sign, cb);
                    },
                    function (rawSigned, keyID, cb){
                      console.log('Peer 0x' + keyID);
                      PeeringService.submit(rawSigned, keyID, cb);
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
        console.log('Sync finished.');
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
    console.log('Transactions of %s...', keyFingerprint);
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
          function (next){
            remoteMerkleFunc.call(remoteMerkleFunc, keyFingerprint, { extract: true }, next);
          },
          function (json, onEveryTransactionProcessed){
            var txNumbers = {};
            _(json.leaves).keys().forEach(function (key) {
              var txNumber = json.leaves[key].value.transaction.number;
              txNumbers[txNumber] = key;
            });
            var numbers = _(txNumbers).keys();
            numbers = _(numbers).map(function (num) {
              return parseInt(num);
            });
            numbers.sort(function (a,b) {
              return a - b;
            });
            async.forEachSeries(numbers, function(number, onSentTransactionsProcessed){
              var k = txNumbers[number];
              var transaction = json.leaves[k].value.transaction;
              var signature = json.leaves[k].value.signature;
              var raw = json.leaves[k].value.raw;
              var i = 0;
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
                        console.log(transaction.sender, transaction.number);
                        TransactionService.process(pubkey, signedTx, next);
                        return;
                      }
                      next();
                    }
                  ], onSentTransactionsProcessed);
                }
              );
            }, onEveryTransactionProcessed);
          }
        ], onKeySentTransactionFinished);
      }
    ], onceSyncFinished);
  }

  function applyMemberships(amendments, amNumber, node, cb) {
    // console.log('Applying memberships for amendment #%s', amNumber);
    async.waterfall([
      function (next) {
        Merkle.forMembership(amNumber - 1, next);
      },
      function (prevMerkle, next) {
        Merkle.updateManyForNextMembership(prevMerkle.leaves(), next);
      },
      function (next) {
        node.hdc.amendments.view.memberships(amNumber, sha1(amendments[amNumber]).toUpperCase(), {}, next);
      },
      function (json, next){
        Merkle.forMembership(amNumber - 1, function (err, prevMerkle) {
          if(prevMerkle.root() != json.levels[0][0]){
            // console.log('MS CHANGES (%s != %s)', prevMerkle.root(), json.levels[0][0]);
            var difff = [];
            async.waterfall([
              function (callback2) {
                node.hdc.amendments.view.memberships(amNumber, sha1(amendments[amNumber]).toUpperCase(), { lstart: json.depth, lend: json.levelsCount }, callback2);
              },
              function (json2, callback2){
                var leaves = json2.levels[json2.levelsCount -1];
                difff = _(leaves).difference(prevMerkle.leaves());
                node.hdc.amendments.view.memberships(amNumber, sha1(amendments[amNumber]).toUpperCase(), { extract: true }, callback2);
              },
              function (json, callback2) {
                applyTargetedMemberships(json.leaves, function (hash) {
                  return ~difff.indexOf(hash);
                }, callback2);
              }
            ], cb);
          }
          else cb();
        });
      }
    ], function (err, result) {
    });
  }

  function applyTargetedMemberships(merkleUrlLeaves, isToApply, done) {
    // console.log("Source memberships: %s", _(merkleUrlLeaves).size());
    async.forEachSeries(_(merkleUrlLeaves).keys(), function(key, callback){
      var msObj = merkleUrlLeaves[key];
      if(isToApply(msObj.hash)){
        var ms = new Membership({});
        _(msObj.value.request).keys().forEach(function (field) {
          ms[field] = msObj.value.request[field];
        });
        var signedMSR = ms.getRaw() + msObj.value.signature;
        MembershipService.submit(signedMSR, callback);
      }
      else callback();
    }, function(err, result){
      if(err){
        done(err);
        return;
      }
      done();
    });
  }

  function applyVotes(amendments, amNumber, number, json, node, cb) {
    // console.log('Applying votes for amendment #%s', amNumber);
    // console.log("Signatures: %s", _(json.leaves).size());
    async.forEachSeries(_(json.leaves).keys(), function(key, callback){
      var vote = json.leaves[key];
      VoteService.submit(amendments[amNumber] + vote.value.signature, function (err, am) {
        // Promotion time
        StrategyService.tryToPromote(am, function (err) {
          if(!err)
            number++;
          callback();
        });
      });
    }, function(err, result){
      cb(err, number);
    });
  }
}

function NodesMerkle (json) {
  
  var that = this;
  ["depth", "nodesCount", "leavesCount", "levelsCount"].forEach(function (key) {
    that[key] = json[key];
  });

  var i = 0;
  this.levels = [];
  while(json && json.levels[i]){
    this.levels.push(json.levels[i]);
    i++;
  }

  this.root = function () {
    return this.levels.length > 0 ? this.levels[0][0] : '';
  }
}
