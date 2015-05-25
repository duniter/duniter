"use strict";
var async            = require('async');
var _                = require('underscore');
var Q                = require('q');
var sha1             = require('sha1');
var moment           = require('moment');
var vucoin           = require('vucoin');
var inquirer         = require('inquirer');
var dos2unix         = require('./dos2unix');
var localValidator   = require('./localValidator');
var logger           = require('./logger')('sync');
var rawer            = require('../lib/rawer');
var constants        = require('../lib/constants');
var Peer             = require('../lib/entity/peer');
var multimeter = require('multimeter');

var CONST_BLOCKS_CHUNK = 500;
var EVAL_REMAINING_INTERVAL = 1000;

module.exports = function Synchroniser (server, host, port, conf, interactive) {
  var that = this;

  var speed = 0, syncStart = new Date(), blocksApplied = 0;
  var watcher = interactive ? new MultimeterWatcher() : new LoggerWatcher();

  if (interactive) {
    require('log4js').configure({
      "appenders": [
        //{ category: "db1", type: "console" }
      ]
    });
  }

  // Services
  var PeeringService     = server.PeeringService;
  var BlockchainService  = server.BlockchainService;

  var dal = server.dal;

  this.sync = function (to, cautiousMode, done) {
    var cautious = typeof cautiousMode == 'undefined' ? false : cautiousMode;
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
          var remoteCurrentNumber = 1;
          async.parallel({
            download: function(callback){
              async.waterfall([

                function (next){
                  logger.info('Downloading Blockchain...');
                  watcher.writeStatus('Connecting to ' + host + '...');
                  async.parallel({
                    localCurrent: function (next) {
                      dal.getCurrentBlockOrNull(next);
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
                  var localStartNumber = lCurrent ? lCurrent.number : -1;
                  var i = lCurrent ? lCurrent.number + 1 : 0;
                  if (!rCurrent) {
                    next('No block found on remote node');
                    return;
                  }

                  remoteCurrentNumber = rCurrent.number;
                  remoteCurrentNumber = Math.min(remoteCurrentNumber, to || remoteCurrentNumber);
                  watcher.writeStatus('Initializing sync...');
                  setInterval(function() {
                    if (remoteCurrentNumber > 1 && speed > 0) {
                      var remain = (remoteCurrentNumber - (localStartNumber + 1 + blocksApplied));
                      var secondsLeft = remain / speed;
                      var momDuration = moment.duration(secondsLeft*1000);
                      watcher.writeStatus('Remaining ' + momDuration.humanize() + '');
                    }
                  }, EVAL_REMAINING_INTERVAL);

                  async.whilst(
                    function () {
                      finishedDownload = rCurrent ? i > Math.min(to || remoteCurrentNumber, remoteCurrentNumber) : false;
                      finishedDownload && watcher.downloadPercent(100);
                      return !finishedDownload;
                    },
                    function (callback) {
                      watcher.downloadPercent(Math.floor(i/remoteCurrentNumber*100));
                      var startBlock = i;
                      var endBlock = (i + CONST_BLOCKS_CHUNK - 1 >= remoteCurrentNumber ? remoteCurrentNumber : i + CONST_BLOCKS_CHUNK - 1);
                      server.dal.getBlockOrNull(endBlock)
                        .then(function(block){
                          if (block) return block;
                          return Q.Promise(function(resolve, reject){
                            async.waterfall([
                              function (next) {
                                logger.info('Blocks #%s to #%s...', startBlock, endBlock);
                                node.blockchain.blocks(Math.min(remoteCurrentNumber - i + 1, CONST_BLOCKS_CHUNK), i, next);
                              },
                              function (blocks, next) {
                                async.forEachSeries(blocks, function (block, callback) {
                                  server.dal.saveBlockInFile(block, false, function(err) {
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
                      if(blocksApplied == 0) {
                        syncStart = new Date();
                      }
                      var succeed;
                      async.doWhilst(
                        function (callback) {
                          var currentNumber = -1;
                          server.dal.getCurrentNumber()
                            .then(function(theCurrentNumber){
                              currentNumber = theCurrentNumber;
                              return server.dal.getBlockOrNull(currentNumber + 1);
                            })
                            .then(function(block){
                              if (block) {
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
                                  blocksApplied++;
                                  speed = blocksApplied / Math.round(Math.max((new Date() - syncStart) / 1000, 1));
                                  if (watcher.appliedPercent() != Math.floor(block.number/remoteCurrentNumber*100)){
                                    watcher.appliedPercent(Math.floor(block.number/remoteCurrentNumber*100));
                                  }
                                  BlockchainService.submitBlock(block, cautious, function(err) {
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
                                      finished = Math.min(to || current.number, current.number) >= currentNumber;
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
                }, function(err) {
                  watcher.appliedPercent(100);
                  processFinished(err);
                });
            }
          }, function(err) {
            watcher.downloadPercent(100);
            watcher.appliedPercent(100);
            next(err);
          });
        },

        function (next) {
          watcher.writeStatus('Peers...');
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
          dal.merkleForPeers.now(next);
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
                      watcher.writeStatus('Peer ' + entry.pubkey);
                      logger.info('Peer ' + entry.pubkey);
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
            else {
              watcher.writeStatus('Peers already known');
              next();
            }
          });
        }
      ], function (err, result) {

        err && watcher.writeStatus(err);
        watcher.end();
        logger.info('Sync finished.');
        done(err);
      });
    }, {
      timeout: conf.timeout || constants.NETWORK.DEFAULT_TIMEOUT
    });
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
          next('Requires a peering entry + signature');
          return;
        }

        remoteJsonPeer = json;
        remoteJsonPeer.pubkey = json.pubkey;
        remoteJsonPeer.status = "NOTHING";
        localValidator().checkPeerSignature(remoteJsonPeer, next);
      },
      function (next) {
        async.waterfall([
          function (next){
            PeeringService.submit(remoteJsonPeer, function (err) {
              next(err == 'Peer document is older than currently recorded' ? null : err);
            });
          }
        ], function (err) {
          next(err);
        });
      }
    ], done);
  }
};

function NodesMerkle (json) {
  
  var that = this;
  ["depth", "nodesCount", "leavesCount"].forEach(function (key) {
    that[key] = json[key];
  });

  this.merkleRoot = json.root;

  // var i = 0;
  // this.levels = [];
  // while(json && json.levels[i]){
  //   this.levels.push(json.levels[i]);
  //   i++;
  // }

  this.root = function () {
    return this.merkleRoot;
  };
}

function MultimeterWatcher() {

  var multi = multimeter(process);
  var charm = multi.charm;
  charm.on('^C', process.exit);
  charm.reset();

  multi.write('Progress:\n\n');

  multi.write("Download: \n");
  var downloadBar = multi("Download: \n".length, 3, {
    width : 20,
    solid : {
      text : '|',
      foreground : 'white',
      background : 'blue'
    },
    empty : { text : ' ' }
  });

  multi.write("Apply:    \n");
  var appliedBar = multi("Apply:    \n".length, 4, {
    width : 20,
    solid : {
      text : '|',
      foreground : 'white',
      background : 'blue'
    },
    empty : { text : ' ' }
  });

  multi.write('\nStatus: ');

  var xPos, yPos;
  charm.position(function (x, y) {
    xPos = x;
    yPos = y;
  });

  this.writeStatus = function(str) {
    charm
      .position(xPos, yPos)
      .erase('end')
      .write(str)
    ;
  };

  this.downloadPercent = function(pct) {
    return downloadBar.percent(pct);
  };

  this.appliedPercent = function(pct) {
    return appliedBar.percent(pct);
  };

  this.end = function() {
    multi.write('\nAll done.\n');
    multi.destroy();
  };

  downloadBar.percent(0);
  appliedBar.percent(0);
}

function LoggerWatcher() {

  var downPct = 0, appliedPct = 0;

  this.writeStatus = function(str) {
    logger.info(str);
  };

  this.downloadPercent = function(pct) {
    downPct = pct;
    return downPct;
  };

  this.appliedPercent = function(pct) {
    appliedPct = pct;
    return appliedPct;
  };

  this.end = function() {
  };

}