var async            = require('async');
var _                = require('underscore');
var Q                = require('q');
var sha1             = require('sha1');
var merkle           = require('merkle');
var vucoin           = require('vucoin');
var eventStream      = require('event-stream');
var inquirer         = require('inquirer');
var dos2unix         = require('./dos2unix');
var parsers          = require('./streams/parsers/doc');
var extractSignature = require('./streams/extractSignature');
var localValidator   = require('./localValidator');
var logger           = require('./logger')('sync');
var rawer            = require('../lib/rawer');
var Peer             = require('../lib/entity/peer');

var CONST_FORCE_TX_PROCESSING = false;
var CONST_BLOCKS_CHUNK = 100;

var blockReadQueue = async.queue(function (task, callback) {
  task(callback);
}, 1);

module.exports = function Synchroniser (server, host, port, conf) {
  var that = this;

  // Services
  var PeeringService     = server.PeeringService;
  var BlockchainService  = server.BlockchainService;

  var dal = server.dal;

  this.sync = function (done) {
    logger.info('Connecting remote host...');
    vucoin(host, port, function (err, node) {
      if(err){
        done('Cannot sync: ' + err);
        return;
      }

      async.waterfall([
        function (next){
          logger.info('Sync started.');
          next();
        },

        //============
        // Blockchain
        //============
        function (next) {
          var availableNumber = -1;
          var finishedDownload = false;
          var finished = false;
          async.parallel({
            download: function(callback){
              async.waterfall([

                function (next){
                  logger.info('Downloading Blockchain...');
                  async.parallel({
                    localCurrent: function (next) {
                      BlockchainService.current(function (err, current) {
                        next(null, err ? null : current);
                      });
                    },
                    remoteCurrent: function (next) {
                      node.blockchain.current(function (err, current) {
                        next(null, err ? null : current);
                      });
                    }
                  }, next);
                },
                function (res, next) {
                  var lCurrent = res.localCurrent;
                  var rCurrent = res.remoteCurrent;
                  var i = lCurrent ? lCurrent.number + 1 : 0;
                  if (!rCurrent) {
                    next('No block found on remote node');
                    return;
                  }
                  async.whilst(
                    function () {
                      finishedDownload = rCurrent ? i <= rCurrent.number : false;
                      return finishedDownload;
                    },
                    function (callback) {
                      var startBlock = i;
                      var endBlock = (i + CONST_BLOCKS_CHUNK - 1 >= rCurrent.number ? rCurrent.number : i + CONST_BLOCKS_CHUNK - 1);
                      server.dal.getBlock(endBlock)
                        .then(function(block){
                          if (block.number >= 0) return block;
                          return Q.Promise(function(resolve, reject){
                            async.waterfall([
                              function (next) {
                                logger.info('Blocks #%s to #%s...', startBlock, endBlock);
                                node.blockchain.blocks(CONST_BLOCKS_CHUNK, i, next);
                              },
                              function (blocks, next) {
                                async.forEachSeries(blocks, function (block, callback) {
                                  server.dal.saveBlockInFile(block, function(err) {
                                    if (!err)
                                      availableNumber = block.number;
                                    callback(err);
                                  });
                                }, next);
                              }
                            ], function(err) {
                              err ? reject(err) : resolve();
                            });
                          });
                        })
                        .done(function() {
                          i += CONST_BLOCKS_CHUNK;
                          callback();
                        });
                    }, next);
                }
              ], callback);
            },
            process: function(processFinished){
              async.whilst(
                function () {
                  return !finished;
                },
                function (callback) {
                  async.waterfall([
                    function (next) {
                      setTimeout(next, 1000);
                    },
                    function (next) {
                      var succeed;
                      async.doWhilst(
                        function (callback) {
                          var currentNumber = -1;
                          server.dal.getCurrentNumber()
                            .then(function(theCurrentNumber){
                              currentNumber = theCurrentNumber;
                              return server.dal.getBlock(currentNumber + 1);
                            })
                            .then(function(block){
                              if (block.number >= 0) {
                                succeed = true;
                                return Q.Promise(function(resolve, reject){
                                  // Rawification of transactions
                                  block.transactions.forEach(function (tx) {
                                    tx.raw = ["TX", "1", tx.signatories.length, tx.inputs.length, tx.outputs.length, tx.comment ? '1' : '0'].join(':') + '\n';
                                    tx.raw += tx.signatories.join('\n') + '\n';
                                    tx.raw += tx.inputs.join('\n') + '\n';
                                    tx.raw += tx.outputs.join('\n') + '\n';
                                    if (tx.comment)
                                      tx.raw += tx.comment + '\n';
                                    tx.raw += tx.signatures.join('\n') + '\n';
                                    tx.version = 1;
                                    tx.currency = conf.currency;
                                    tx.issuers = tx.signatories;
                                    tx.hash = ("" + sha1(rawer.getTransaction(tx))).toUpperCase();
                                  });
                                  BlockchainService.submitBlock(block, true, function(err) {
                                    err ? reject(err) : resolve();
                                  })
                                });
                              }
                              else {
                                succeed = false;
                                return Q.Promise(function(resolve, reject){
                                  node.blockchain.current(function (err, current) {
                                    if (err) {
                                      reject(err);
                                    } else {
                                      finished = current.number == currentNumber;
                                      resolve();
                                    }
                                  });
                                });
                              }
                            })
                            .done(callback);
                        },
                        function () {
                          return succeed;
                        }, next);
                    }
                  ], callback);
                }, processFinished);
            }
          }, function(err) {
            next(err);
          });
        },

        function (next) {
          syncPeer(node, next);
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

        //=======
        // Peers
        //=======
        function (next){
          dal.merkleForPeers(next);
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
                      ["version", "currency", "pubkey", "endpoints", "block"].forEach(function (key) {
                        entry[key] = jsonEntry[key];
                      });
                      entry.signature = sign;
                      logger.info('Peer 0x' + entry.fingerprint);
                      PeeringService.submit(entry, function (err) {
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
        }
      ], function (err, result) {
        logger.info('Sync finished.');
        done(err);
      });
    })
  };

  //============
  // Peer
  //============
  function syncPeer (node, done) {

    // Global sync vars
    var remotePeer = new Peer({});
    var remoteJsonPeer = {};
    var remotePubkey;

    async.waterfall([
      function (next){
        node.network.peering.get(next);
      },
      function (json, next){
        remotePubkey = json.pubkey;
        remotePeer.copyValuesFrom(json);
        var entry = remotePeer.getRaw();
        var signature = dos2unix(remotePeer.signature);
        // Parameters
        if(!(entry && signature)){
          callback('Requires a peering entry + signature');
          return;
        }

        remoteJsonPeer = json;
        remoteJsonPeer.pub = json.pubkey;
        remoteJsonPeer.status = "NOTHING";
        localValidator().checkPeerSignature(remoteJsonPeer, next);
      },
      function (next) {
        async.waterfall([
          function (next){
            PeeringService.submit(remoteJsonPeer, function (err) {
              next(err == 'Peer document is older than currently recorded' ? null : err);
            });
          },
        ], function (err) {
          next(err);
        });
      },
    ], done);
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
