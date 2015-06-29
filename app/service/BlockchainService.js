"use strict";

var path            = require('path');
var async           = require('async');
var _               = require('underscore');
var Q               = require('q');
var sha1            = require('sha1');
var moment          = require('moment');
var inquirer        = require('inquirer');
var childProcess    = require('child_process');
var usage           = require('usage');
var base58          = require('../lib/base58');
var signature       = require('../lib/signature');
var constants       = require('../lib/constants');
var localValidator  = require('../lib/localValidator');
var globalValidator = require('../lib/globalValidator');
var blockchainDao   = require('../lib/blockchainDao');
var blockchainCtx   = require('../lib/blockchainContext');

module.exports = function (conf, dal, PeeringService) {
  return new BlockchainService(conf, dal, PeeringService);
};

var powFifo = async.queue(function (task, callback) {
  task(callback);
}, 1);

var cancels = [];

var statQueue = async.queue(function (task, callback) {
  task(callback);
}, 1);

// Callback used as a semaphore to sync block reception & PoW computation
var newKeyblockCallback = null;

// Callback used to start again computation of next PoW
var computeNextCallback = null;

// Timeout var for delaying computation of next block
var computationTimeout = null;

// Flag for saying if timeout was already waited
var computationTimeoutDone = false;

function BlockchainService (conf, dal, pair) {

  var that = this;
  var mainContext = blockchainCtx(conf, dal);
  var logger = require('../lib/logger')(dal.profile);
  var selfPubkey = base58.encode(pair.publicKey);

  var lastGeneratedWasWrong = false;

  var Identity      = require('../lib/entity/identity');
  var Certification = require('../lib/entity/certification');
  var Membership    = require('../lib/entity/membership');
  var Block         = require('../lib/entity/block');
  var Transaction   = require('../lib/entity/transaction');

  this.current = function (done) {
    dal.getCurrentBlockOrNull(done);
  };

  this.promoted = function (number, done) {
    dal.getPromoted(number, done);
  };

  this.checkBlock = mainContext.checkBlock;

  this.submitBlock = function (obj, doCheck, simulation) {
    return mainContext.addBlock(obj, doCheck, simulation)
      .tap(function(){
        return Q.nfcall(that.stopPoWThenProcessAndRestartPoW.bind(that));
      })
      .then(function(block){
        return block;
      })
      ;
  };

  this.stopPoWThenProcessAndRestartPoW = function (done) {
    // If PoW computation process is waiting, trigger it
    if (computeNextCallback)
      computeNextCallback();
    if (conf.participate && !cancels.length) {
      powFifo.push(function (taskDone) {
        cancels.push(taskDone);
      });
    }
    done();
  };

  function checkWoTConstraints (sentries, block, newLinks, done) {
    if (block.number >= 0) {
      var newcomers = [];
      var ofMembers = [].concat(sentries);
      // other blocks may introduce unstability with new members
      async.waterfall([
        function (next) {
          block.joiners.forEach(function (inlineMS) {
            var fpr = inlineMS.split(':')[0];
            newcomers.push(fpr);
            ofMembers.push(fpr);
          });
          async.forEachSeries(newcomers, function (newcomer, newcomerTested) {
            async.waterfall([
              function (next) {
                if (block.number > 0)
                  mainContext.checkHaveEnoughLinks(newcomer, newLinks, next);
                else
                  next();
              },
              function (next) {
                // Check the newcomer IS RECOGNIZED BY the WoT
                // (check we have a path for each WoT member => newcomer)
                if (block.number > 0)
                  globalValidator(conf, blockchainDao(block, dal)).isOver3Hops(newcomer, ofMembers, newLinks, next);
                else
                  next(null, []);
              },
              function (outdistanced, next) {
                if (outdistanced.length > 0) {
                  // logger.debug('------ Newcomers ------');
                  // logger.debug(newcomers);
                  // logger.debug('------ Members ------');
                  // logger.debug(ofMembers);
                  // logger.debug('------ newLinks ------');
                  // logger.debug(newLinks);
                  // logger.debug('------ outdistanced ------');
                  // logger.debug(outdistanced);
                  next('Newcomer ' + newcomer + ' is not recognized by the WoT for this block');
                }
                else next();
              }
            ], newcomerTested);
          }, next);
        }
      ], done);
    }
    else done('Cannot compute WoT constraint for negative block number');
  }

  function getSentryMembers(members, done) {
    var sentries = [];
    async.forEachSeries(members, function (m, callback) {
      async.waterfall([
        function (next) {
          dal.getValidLinksFrom(m.pubkey, next);
        },
        function (links, next) {
          // Only test agains members who make enough signatures
          if (links.length >= conf.sigWoT) {
            sentries.push(m.pubkey);
          }
          next();
        }
      ], callback);
    }, function(err) {
      done(err, sentries);
    });
  }

  /**
   * Generates root block with manual selection of root members.
   * @param done
   */
  this.generateManualRoot = function (done) {
    async.waterfall([
      function (next) {
        that.current(next);
      },
      function (block, next) {
        if (!block)
        that.generateNextBlock(new ManualRootGenerator(), next);
        else
          next('Cannot generate root block: it already exists.');
      }
    ], done);
  };

  function iteratedChecking(newcomers, checkWoTForNewcomers, done) {
    var passingNewcomers = [];
    async.forEachSeries(newcomers, function(newcomer, callback){
      checkWoTForNewcomers(passingNewcomers.concat(newcomer), function (err) {
        // If success, add this newcomer to the valid newcomers. Otherwise, reject him.
        if (!err)
          passingNewcomers.push(newcomer);
        callback();
      });
    }, function(){
      done(null, passingNewcomers);
    });
  }

  /**
   * Generates next block, finding newcomers, renewers, leavers, certs, transactions, etc.
   * @param done Callback.
   */
  this.generateNext = function (done) {
    return that.generateNextBlock(new NextBlockGenerator(conf, dal), done);
  };

  /**
  * Generate next block, gathering both updates & newcomers
  */
  this.generateNextBlock = function (generator, done) {
    return prepareNextBlock()
      .spread(function(current, lastUDBlock, exclusions){
        return Q.all([
          generator.findNewCertsFromWoT(current),
          findNewcomersAndLeavers(current, generator.filterJoiners),
          findTransactions()
        ])
          .spread(function(newCertsFromWoT, newcomersLeavers, transactions) {
            var joinData = newcomersLeavers[2];
            var leaveData = newcomersLeavers[3];
            var newCertsFromNewcomers = newcomersLeavers[4];
            // Merges updates
            _(newCertsFromNewcomers).keys().forEach(function(newcomer){
              // TODO: Bizarre ..
              if (!newCertsFromWoT[newcomer]){
                newCertsFromWoT[newcomer] = newCertsFromNewcomers[newcomer];
              }
              else {
                newCertsFromWoT[newcomer] = newCertsFromWoT[newcomer].concat(newCertsFromNewcomers[newcomer]);
              }
            });
            // Create the block
            return Q.Promise(function(resolve, reject){
              createBlock(current, joinData, leaveData, newCertsFromWoT, exclusions, lastUDBlock, transactions, function(err, block) {
                err ? reject(err) : resolve(block);
              });
            });
          }, Q.reject);
      }, Q.reject)
      .then(function(block) {
        done && done(null, block);
        return block;
      })
      .fail(function(err) {
        if (!done) throw err;
        else done(err);
      });
  };

  /**
  * Generate next block, gathering both updates & newcomers
  */
  this.generateEmptyNextBlock = function (done) {
    return prepareNextBlock()
      .spread(function(current, lastUDBlock, exclusions){
        createBlock(current, {}, {}, {}, exclusions, lastUDBlock, [], done);
      })
      .fail(done);
  };

  function prepareNextBlock() {
    return Q.all([
      dal.getCurrentBlockOrNull(),
      dal.lastUDBlock(),
      dal.getToBeKicked()
    ])
      .spread(function(current, lastUDBlock, exclusions) {
        return Q.all([
          current,
          lastUDBlock,
          _.pluck(exclusions, 'pubkey')
        ]);
      });
  }

  function findTransactions() {
    return dal.findAllWaitingTransactions()
      .then(function (txs) {
        var transactions = [];
        var passingTxs = [];
        var localValidation = localValidator(conf);
        var globalValidation = globalValidator(conf, blockchainDao(null, dal));
        return Q.Promise(function(resolve, reject){

          async.forEachSeries(txs, function (rawtx, callback) {
            var tx = new Transaction(rawtx, conf.currency);
            var extractedTX = tx.getTransaction();
            async.waterfall([
              function (next) {
                localValidation.checkBunchOfTransactions(passingTxs.concat(extractedTX), next);
              },
              function (next) {
                globalValidation.checkSingleTransaction(extractedTX, next);
              },
              function (next) {
                transactions.push(tx);
                passingTxs.push(extractedTX);
                next();
              }
            ], function (err) {
              if (err) {
                logger.error(err);
                dal.removeTxByHash(extractedTX.hash, callback);
              }
              else {
                logger.info('Transaction added to block');
                callback();
              }
            });
          }, function(err) {
            err ? reject(err) : resolve(transactions);
          });
        });
      });
  }

  function findNewcomersAndLeavers (current, filteringFunc) {
    return Q.Promise(function(resolve, reject){
      async.parallel({
        newcomers: function(callback){
          findNewcomers(current, filteringFunc, callback);
        },
        leavers: function(callback){
          findLeavers(current, callback);
        }
      }, function(err, res) {
        var current = res.newcomers[0];
        var newWoTMembers = res.newcomers[1];
        var finalJoinData = res.newcomers[2];
        var updates = res.newcomers[3];
        err ? reject(err) : resolve([current, newWoTMembers, finalJoinData, res.leavers, updates]);
      });
    });
  }

  function findLeavers (current, done) {
    var leaveData = {};
    async.waterfall([
      function (next){
        dal.findLeavers(next);
      },
      function (mss, next){
        var leavers = [];
        mss.forEach(function (ms) {
          leavers.push(ms.issuer);
        });
        async.forEach(mss, function(ms, callback){
          var leave = { identity: null, ms: ms, key: null, idHash: '' };
          leave.idHash = (sha1(ms.userid + moment(ms.certts).unix() + ms.issuer) + "").toUpperCase();
          async.waterfall([
            function (next){
              async.parallel({
                block: function (callback) {
                  if (current) {
                    dal.getBlockOrNull(ms.number, function (err, basedBlock) {
                      callback(null, err ? null : basedBlock);
                    });
                  } else {
                    callback(null, {});
                  }
                },
                identity: function(callback){
                  dal.getIdentityByHashOrNull(leave.idHash, callback);
                }
              }, next);
            },
            function (res, next){
              if (res.identity && res.block && res.identity.currentMSN < leave.ms.number && res.identity.member) {
                // MS + matching cert are found
                leave.identity = res.identity;
                leaveData[res.identity.pubkey] = leave;
              }
              next();
            }
          ], callback);
        }, next);
      },
      function (next) {
        next(null, leaveData);
      }
    ], done);
  }

  function findNewcomers (current, filteringFunc, done) {
    var wotMembers = [];
    var joinData = {};
    var updates = {};
    async.waterfall([
      function (next) {
        getPreJoinData(current, next);
      },
      function (preJoinData, next){
        filteringFunc(preJoinData, next);
      },
      function (filteredJoinData, next) {
        joinData = filteredJoinData;
        // Cache the members
        dal.getMembers(next);
      },
      function (members, next) {
        getSentryMembers(members, function(err, sentries) {
          next(err, members, sentries);
        });
      },
      function (members, sentries, next) {
        wotMembers = _.pluck(members, 'pubkey');
        // Checking step
        var newcomers = _(joinData).keys();
        // Checking algo is defined by 'checkingWoTFunc'
        iteratedChecking(newcomers, function (someNewcomers, onceChecked) {
          var nextBlock = {
            number: current ? current.number + 1 : 0,
            joiners: someNewcomers
          };
          // Check WoT stability
          async.waterfall([
            function (next){
              computeNewLinks(someNewcomers, joinData, updates, next);
            },
            function (newLinks, next){
              checkWoTConstraints(sentries, nextBlock, newLinks, next);
            }
          ], onceChecked);
        }, function (err, realNewcomers) {
          async.waterfall([
            function (next){
              computeNewLinks(realNewcomers, joinData, updates, next);
            },
            function (newLinks, next){
              var newWoT = wotMembers.concat(realNewcomers);
              next(err, realNewcomers, newLinks, newWoT);
            }
          ], next);
        });
      },
      function (realNewcomers, newLinks, newWoT, next) {
        var finalJoinData = {};
        realNewcomers.forEach(function(newcomer){
          // Only keep membership of selected newcomers
          finalJoinData[newcomer] = joinData[newcomer];
          // Only keep certifications from final members
          var keptCerts = [];
          joinData[newcomer].certs.forEach(function(cert){
            var issuer = cert.from;
            if (~newWoT.indexOf(issuer) && ~newLinks[cert.to].indexOf(issuer)) {
              keptCerts.push(cert);
            }
          });
          joinData[newcomer].certs = keptCerts;
        });
        // Send back the new WoT, the joining data and key updates for newcomers' signature of WoT
        next(null, current, wotMembers.concat(realNewcomers), finalJoinData, updates);
      }
    ], done);
  }

  function getPreJoinData(current, done) {
    var preJoinData = {};
    async.waterfall([
      function (next){
        dal.findNewcomers(next);
      },
      function (mss, next){
        var joiners = [];
        mss.forEach(function (ms) {
          joiners.push(ms.issuer);
        });
        async.forEach(mss, function(ms, callback){
          var join = { identity: null, ms: ms, key: null, idHash: '' };
          join.idHash = (sha1(ms.userid + moment(ms.certts).unix() + ms.issuer) + "").toUpperCase();
          async.waterfall([
            function (next){
              async.parallel({
                block: function (callback) {
                  if (current) {
                    dal.getBlockOrNull(ms.number, callback);
                  } else {
                    callback(null, {});
                  }
                },
                identity: function(callback){
                  dal.getIdentityByHashOrNull(join.idHash, callback);
                },
                certs: function(callback){
                  if (!current) {
                    // Look for certifications from initial joiners
                    dal.certsTo(ms.issuer)
                      .then(function(certs){
                        callback(null, _.filter(certs, function(cert){
                          return ~joiners.indexOf(cert.from);
                        }));
                      })
                      .fail(callback);
                  } else {
                    // Look for certifications from WoT members
                    dal.certsNotLinkedToTarget(join.idHash)
                      .then(function(certs){
                        var finalCerts = [];
                        var certifiers = [];
                        async.forEachSeries(certs, function (cert, callback) {
                          async.waterfall([
                            function (next) {
                              if (current) {
                                // Already exists a link not replayable yet?
                                dal.existsLinkFromOrAfterDate(cert.from, cert.to, current.medianTime - conf.sigDelay)
                                  .then(function(exists) {
                                    if (exists)
                                      next('It already exists a similar certification written, which is not replayable yet');
                                    else
                                      dal.isMember(cert.from, next);
                                  })
                                  .fail(next);
                              }
                              else next(null, false);
                            },
                            function (isMember, next) {
                              var doubleSignature = ~certifiers.indexOf(cert.from) ? true : false;
                              if (isMember && !doubleSignature) {
                                certifiers.push(cert.from);
                                finalCerts.push(cert);
                              }
                              next();
                            }
                          ], function () {
                            callback();
                          });
                        }, function () {
                          callback(null, finalCerts);
                        });
                      })
                      .fail(callback);
                  }
                }
              }, next);
            },
            function (res, next){
              if (res.identity && res.block && res.identity.currentMSN < parseInt(join.ms.number)) {
                // MS + matching cert are found
                join.identity = res.identity;
                join.certs = res.certs;
                // join.wotCerts = res.wotCerts;
                preJoinData[res.identity.pubkey] = join;
              }
              next();
            }
          ], callback);
        }, next);
      }
    ], function(err) {
      done(err, preJoinData);
    });
  }

  function computeNewLinks (theNewcomers, joinData, updates, done) {
    var newLinks = {};
    var certsByKey = _.mapObject(joinData, function(val){ return val.certs; });
    async.waterfall([
      function (next){
        async.forEach(theNewcomers, function(newcomer, callback){
          // New array of certifiers
          newLinks[newcomer] = newLinks[newcomer] || [];
          // Check wether each certification of the block is from valid newcomer/member
          async.forEach(certsByKey[newcomer], function(cert, callback){
            if (~theNewcomers.indexOf(cert.from)) {
              // Newcomer to newcomer => valid link
              newLinks[newcomer].push(cert.from);
              callback();
            } else {
              async.waterfall([
                function (next){
                  dal.isMember(cert.from, next);
                },
                function (isMember, next){
                  // Member to newcomer => valid link
                  if (isMember)
                    newLinks[newcomer].push(cert.from);
                  next();
                }
              ], callback);
            }
          }, callback);
        }, next);
      },
      function (next){
        _.mapObject(updates, function(certs, pubkey) {
          newLinks[pubkey] = (newLinks[pubkey] || []).concat(_.pluck(certs, 'pubkey'));
        });
        next();
      }
    ], function (err) {
      done(err, newLinks);
    });
  }

  function createBlock (current, joinData, leaveData, updates, exclusions, lastUDBlock, transactions, done) {
    // Prevent writing joins/updates for excluded members
    exclusions.forEach(function (excluded) {
      delete updates[excluded];
      delete joinData[excluded];
      delete leaveData[excluded];
    });
    _(leaveData).keys().forEach(function (leaver) {
      delete updates[leaver];
      delete joinData[leaver];
    });
    var block = new Block();
    block.version = 1;
    block.currency = current ? current.currency : conf.currency;
    block.number = current ? current.number + 1 : 0;
    block.parameters = block.number > 0 ? '' : [
      conf.c, conf.dt, conf.ud0,
      conf.sigDelay, conf.sigValidity,
      conf.sigQty, conf.sigWoT, conf.msValidity,
      conf.stepMax, conf.medianTimeBlocks, conf.avgGenTime, conf.dtDiffEval,
      conf.blocksRot, (conf.percentRot == 1 ? "1.0" : conf.percentRot)
    ].join(':');
    block.previousHash = current ? current.hash : "";
    block.previousIssuer = current ? current.issuer : "";
    if (selfPubkey)
      block.issuer = selfPubkey;
    // Members merkle
    var joiners = _(joinData).keys();
    var previousCount = current ? current.membersCount : 0;
    if (joiners.length == 0 && !current) {
      done('Wrong new block: cannot make a root block without members');
      return;
    }
    // Newcomers
    block.identities = [];
    // Newcomers + back people
    block.joiners = [];
    joiners.forEach(function(joiner){
      var data = joinData[joiner];
      // Identities only for never-have-been members
      if (!data.identity.member && !data.identity.wasMember) {
        block.identities.push(new Identity(data.identity).inline());
      }
      // Join only for non-members
      if (!data.identity.member) {
        block.joiners.push(new Membership(data.ms).inline());
      }
    });
    // Renewed
    block.actives = [];
    joiners.forEach(function(joiner){
      var data = joinData[joiner];
      // Join only for non-members
      if (data.identity.member) {
        block.actives.push(new Membership(data.ms).inline());
      }
    });
    // Leavers
    block.leavers = [];
    var leavers = _(leaveData).keys();
    leavers.forEach(function(leaver){
      var data = leaveData[leaver];
      // Join only for non-members
      if (data.identity.member) {
        block.leavers.push(new Membership(data.ms).inline());
      }
    });
    // Kicked people
    block.excluded = exclusions;
    // Final number of members
    block.membersCount = previousCount + block.joiners.length - block.excluded.length;

    //----- Certifications -----
    var certifiers = []; // Since we cannot have two certifications from same issuer/block, unless block# == 0

    // Certifications from the WoT, to newcomers
    block.certifications = [];
    joiners.forEach(function(joiner){
      var data = joinData[joiner];
      var doubleCerts = false;
      data.certs.forEach(function(cert){
        doubleCerts = doubleCerts || (~certifiers.indexOf(cert.from) ? true : false);
      });
      if (!doubleCerts || block.number == 0) {
        data.certs.forEach(function(cert){
          block.certifications.push(new Certification(cert).inline());
          certifiers.push(cert.from);
        });
      }
    });
    // Certifications from the WoT, to the WoT
    _(updates).keys().forEach(function(certifiedMember){
      var certs = updates[certifiedMember];
      certs.forEach(function(cert){
        if (certifiers.indexOf(cert.from) == -1) {
          block.certifications.push(new Certification(cert).inline());
          certifiers.push(cert.from);
        }
      });
    });
    // Transactions
    block.transactions = [];
    transactions.forEach(function (tx) {
      block.transactions.push({ raw: tx.compact() });
    });
    async.waterfall([
      function (next) {
        // PoWMin
        if (block.number == 0)
          next(null, 0); // Root difficulty is given by manually written block
        else
          globalValidator(conf, blockchainDao(block, dal)).getPoWMin(block.number, next);
      },
      function (powMin, next) {
        block.powMin = powMin;
        // MedianTime
        if (block.number == 0)
          next(null, 0);
        else
          globalValidator(conf, blockchainDao(block, dal)).getMedianTime(block.number, next);
      },
      function (medianTime, next) {
        block.medianTime = current ? medianTime : moment.utc().unix() - conf.rootoffset;
        next();
      },
      function (next) {
        // Universal Dividend
        if (lastUDBlock)
          next(null, lastUDBlock.UDTime);
        else
          dal.getRootBlock(function (err, root) {
            if (root)
              next(null, root.medianTime);
            else
              next(null, null);
          });
      },
      function (lastUDTime, next) {
        if (lastUDTime != null) {
          if (current && lastUDTime + conf.dt <= block.medianTime) {
            var M = current.monetaryMass || 0;
            var c = conf.c;
            var N = block.membersCount;
            var previousUD = lastUDBlock ? lastUDBlock.dividend : conf.ud0;
            block.dividend = Math.ceil(Math.max(previousUD, c * M / N));
          }
        }
        next(null, block);
      }
    ], done);
  }

  var debug = process.execArgv.toString().indexOf('--debug') !== -1;
  if(debug) {
    //Set an unused port number.
    process.execArgv = [];
  }
  var powWorker;

  this.getPoWProcessStats = function(done) {
    if (powWorker)
      usage.lookup(powWorker.powProcess.pid, done);
    else
      done(null, { memory: 0, cpu: 0 });
  };

  var askedStop = null;

  this.stopProof = function(done) {
    if (!newKeyblockCallback) {
      askedStop = 'Stopping node.';
      newKeyblockCallback = function() {
        newKeyblockCallback = null;
        // Definitely kill the process for this BlockchainService instance
        if (powWorker) {
          powWorker.kill();
        }
        done();
      };
    }
    else done();
  };

  this.prove = function (block, sigFunc, nbZeros, done) {

    return Q.Promise(function(resolve){
      if (!powWorker) {
        powWorker = new Worker();
      }
      if (block.number == 0) {
        // On initial block, difficulty is the one given manually
        block.powMin = nbZeros;
      }
      // Start
      powWorker.setOnPoW(function(err, powBlock) {
        var theBlock = (powBlock && new Block(powBlock)) || null;
        resolve(theBlock);
        done && done(null, theBlock);
      });

      block.nonce = 0;
      powWorker.powProcess.send({ conf: conf, block: block, zeros: nbZeros,
        pair: {
          secretKeyEnc: base58.encode(pair.secretKey)
        }
      });
      logger.info('Generating proof-of-work of block #%s with %s leading zeros... (CPU usage set to %s%)', block.number, nbZeros, (conf.cpu*100).toFixed(0));
    });
  };

  function Worker() {

    var stopped = true;
    var that = this;
    var onPoWFound = function() { throw 'Proof-of-work found, but no listener is attached.'; };
    that.powProcess = childProcess.fork(path.join(__dirname, '/../lib/proof'));
    var start = null;
    var speedMesured = false;

    that.powProcess.on('message', function(msg) {
      var block = msg.block;
      if (stopped) {
        // Started...
        start = new Date();
        stopped = false;
      }
      if (!stopped && msg.found) {
        var end = new Date();
        var duration = (end.getTime() - start.getTime());
        var testsPerSecond = (1000/duration * msg.testsCount).toFixed(2);
        logger.debug('Done: %s in %ss (%s tests, ~%s tests/s)', msg.pow, (duration/1000).toFixed(2), msg.testsCount, testsPerSecond);
        stopped = true;
        start = null;
        onPoWFound(null, block);
      } else if (!stopped && msg.testsPerRound) {
        logger.info('Mesured max speed is ~%s tests/s. Proof will try with ~%s tests/s.', msg.testsPerSecond, msg.testsPerRound);
        speedMesured = true;
      } else if (!stopped && msg.nonce > block.nonce + constants.PROOF_OF_WORK.RELEASE_MEMORY) {
        // Reset fork process (release memory)...
        //logger.debug('Release mem... lastCount = %s, nonce = %s', block.nonce);
        block.nonce = msg.nonce;
        speedMesured = false;
        that.powProcess.kill();
        powWorker = new Worker();
        that.powProcess.send({ conf: conf, block: block, zeros: msg.nbZeros, pair: {
            secretKeyEnc: base58.encode(pair.secretKey)
          }
        });
      } else if (!stopped) {
        // Continue...
        //console.log('Already made: %s tests...', msg.nonce);
        // Look for incoming block
        if (speedMesured && cancels.length) {
          speedMesured = false;
          stopped = true;
          that.powProcess.kill();
          that.powProcess = null;
          powWorker = null;
          onPoWFound();
          logger.debug('Proof-of-work computation canceled.');
          start = null;
          var cancelConfirm = cancels.shift();
          cancelConfirm();
        }
      }
    });

    this.kill = function() {
      if (that.powProcess) {
        that.powProcess.kill();
        that.powProcess = null;
      }
    };

    this.setOnPoW = function(onPoW) {
      onPoWFound = onPoW;
    };
  }

  this.startGeneration = function (done) {
    if (!conf.participate) return;
    if (!selfPubkey) {
      done('No self pubkey found.');
      return;
    }
    askedStop = null;
    if (computationTimeout) {
      clearTimeout(computationTimeout);
      computationTimeout = null;
    }
    var block, current;
    async.waterfall([
      function (next) {
        dal.isMember(selfPubkey, function (err, isMember) {
          if (err || !isMember)
            next('Skipping', null, 'Local node is not a member. Waiting to be a member before computing a block.');
          else
            next();
        });
      },
      function (next) {
        dal.getCurrentBlockOrNull(function (err, current) {
          if (err)
            next('Skipping', null, 'Waiting for a root block before computing new blocks');
          else
            next(null, current);
        });
      },
      function (theCurrent, next) {
        current = theCurrent;
        var lastIssuedByUs = current.issuer == selfPubkey;
        if (lastIssuedByUs && conf.powDelay && !computationTimeoutDone) {
          computationTimeoutDone = true;
          computationTimeout = function() {
            computationTimeout = setTimeout(function () {
              if (computeNextCallback)
                computeNextCallback();
            }, conf.powDelay * 1000);
          };
          next('Skipping', null, 'Waiting ' + conf.powDelay + 's before starting computing next block...');
        }
        else next();
      },
      function (next){
        if (!current) {
          return next(null, null, 'Waiting for a root block before computing new blocks');
        }
        async.waterfall([
          function(nextOne) {
            globalValidator(conf, blockchainDao(block, dal)).getTrialLevel(selfPubkey, nextOne);
          },
          function(trial, nextOne) {
            if (trial > (current.powMin + 1)) {
              return nextOne('Too high difficulty: waiting for other members to write next block');
            }
            async.parallel({
              block: function(callback){
                if (lastGeneratedWasWrong) {
                  that.generateEmptyNextBlock(callback);
                } else {
                  that.generateNext(callback);
                }
              },
              signature: function(callback){
                signature.sync(pair, callback);
              },
              trial: function (callback) {
                globalValidator(conf, blockchainDao(block, dal)).getTrialLevel(selfPubkey, callback);
              }
            }, nextOne);
          },
          function (res, nextOne){
            computationTimeoutDone = false;
            that.makeNextBlock(res.block, res.signature, res.trial, function (err, proofBlock) {
              nextOne(null, proofBlock, err);
            });
          }
        ], function(err) {
          next(null, null, err);
        });
      }
    ], function (err, proofBlock, powCanceled) {
      if (powCanceled) {
        logger.warn(powCanceled);
        computeNextCallback = function () {
          computeNextCallback = null;
          done(null, null);
        };
        if (computationTimeout && typeof computationTimeout == 'function') {
          computationTimeout();
        } else {
          setTimeout(function() {
            done(null, null);
          }, 1000 * 60);
        }
      } else {
        // Proof-of-work found
        done(err || askedStop, proofBlock);
      }
    });
  };

  this.makeNextBlock = function(block, sigFunc, trial, done) {
    return Q.all([
      block ? Q(block) : that.generateNext(),
      sigFunc ? Q(sigFunc) : signature.sync(pair),
      trial ? Q(trial) : globalValidator(conf, blockchainDao(block, dal)).getTrialLevel(selfPubkey)
    ])
      .spread(function(unsignedBlock, sigF, trialLevel){
        return that.prove(unsignedBlock, sigF, trialLevel)
          .then(function(signedBlock){
            done && done(null, signedBlock);
            return signedBlock;
          })
          .fail(function(err){
            if (done) {
              return done(err);
            }
            throw err;
          });
      });
  };

  this.addStatComputing = function () {
    var tests = {
      'newcomers': 'identities',
      'certs': 'certifications',
      'joiners': 'joiners',
      'actives': 'actives',
      'leavers': 'leavers',
      'excluded': 'excluded',
      'ud': 'dividend',
      'tx': 'transactions',
      'tx_history': saveHistory
    };
    statQueue.push(function (sent) {
      //logger.debug('Computing stats...');
      async.forEachSeries(['newcomers', 'certs', 'joiners', 'actives', 'leavers', 'excluded', 'ud', 'tx', 'tx_history'], function (statName, callback) {
        async.waterfall([
          function (next) {
            async.parallel({
              stat: function (next) {
                dal.getStat(statName, next);
              },
              current: function (next) {
                that.current(next);
              }
            }, next);
          },
          function (res, next) {
            var stat = res.stat;
            var current = res.current;
            // Compute new stat
            async.forEachSeries(_.range(stat.lastParsedBlock + 1, (current ? current.number : -1) + 1), function (blockNumber, callback) {
              // console.log('Stat', statName, ': tested block#' + blockNumber);
              async.waterfall([
                function (next) {
                  dal.getBlockOrNull(blockNumber, next);
                },
                function (block, next) {
                  var testProperty = tests[statName];
                  if (typeof testProperty === 'function') {
                    saveHistory(block)
                      .then(function(){
                        stat.lastParsedBlock = blockNumber;
                        next();
                      })
                      .fail(function(err){
                        next(err);
                      });
                  } else {
                    var value = block[testProperty];
                    var isPositiveValue = value && typeof value != 'object';
                    var isNonEmptyArray = value && typeof value == 'object' && value.length > 0;
                    if (isPositiveValue || isNonEmptyArray) {
                      stat.blocks.push(blockNumber);
                    }
                    stat.lastParsedBlock = blockNumber;
                    next();
                  }
                }
              ], callback);
            }, function (err) {
              next(err, stat);
            });
          },
          function (stat, next) {
            dal.saveStat(stat, statName, function (err) {
              next(err);
            });
          }
        ], callback);
      }, function () {
        //logger.debug('Computing stats: done!');
        sent();
      });
    });
  };

  function saveHistory(block) {
    return block.transactions.reduce(function(promise, tx) {
      return promise
        .then(function(){
          var issuers = [], recipients = [];
          tx.signatories.forEach(function(issuer){
            issuers.push(issuer);
          });
          tx.outputs.forEach(function(out){
            var recip = out.split(':')[0];
            if (issuers.indexOf(recip) === -1) {
              recipients.push(recip);
            }
          });
          return Q.all(issuers.map(function(issuer) {
            return dal.saveTxInHistory('sent', issuer, tx);
          }))
            .then(function(){
            return Q.all(recipients.map(function(receipient) {
              return dal.saveTxInHistory('received', receipient, tx);
            }));
          });
        });
    }, Q());
  }
}

/**
 * Class to implement strategy of automatic selection of incoming data for next block.
 * @constructor
 */
function NextBlockGenerator(conf, dal) {

  this.findNewCertsFromWoT = function(current) {
    return Q.Promise(function(resolve, reject){
      var updates = {};
      var updatesToFrom = {};
      async.waterfall([
        function (next) {
          dal.certsFindNew(next);
        },
        function (certs, next){
          async.forEachSeries(certs, function(cert, callback){
            async.waterfall([
              function (next) {
                if (current) {
                  // Already exists a link not replayable yet?
                  dal.existsLinkFromOrAfterDate(cert.from, cert.to, current.medianTime - conf.sigDelay)
                    .then(function(exists) {
                      next(null, exists);
                    })
                    .fail(next);
                }
                else next(null, false);
              },
              function (exists, next) {
                if (exists)
                  next('It already exists a similar certification written, which is not replayable yet');
                else {
                  // Signatory must be a member
                  dal.isMemberOrError(cert.from, next);
                }
              },
              function (next){
                // Certified must be a member and non-leaver
                dal.isMembeAndNonLeaverOrError(cert.to, next);
              },
              function (next){
                updatesToFrom[cert.to] = updatesToFrom[cert.to] || [];
                updates[cert.to] = updates[cert.to] || [];
                if (updatesToFrom[cert.to].indexOf(cert.from) == -1) {
                  updates[cert.to].push(cert);
                  updatesToFrom[cert.to].push(cert.from);
                }
                next();
              }
            ], function () {
              callback();
            });
          }, next);
        }
      ], function (err) {
        err ? reject(err) : resolve(updates);
      });
    });
  };

  this.filterJoiners = function takeAllJoiners(preJoinData, done) {
    var validator = globalValidator(conf, blockchainDao(dal));
    // No manual filtering, takes all BUT already used UID or pubkey
    var filtered = {};
    async.forEach(_.keys(preJoinData), function(pubkey, callback) {
      async.waterfall([
        function(next) {
          validator.checkExistsUserID(preJoinData[pubkey].identity.uid, next);
        },
        function(exists, next) {
          if (exists) {
            return next('UID already taken');
          }
          validator.checkExistsPubkey(pubkey, next);
        },
        function(exists, next) {
          if (exists) {
            return next('Pubkey already taken');
          }
          next();
        }
      ], function(err) {
        if (!err) {
          filtered[pubkey] = preJoinData[pubkey];
        }
        callback();
      });
    }, function(err) {
      done(err, filtered);
    });
  };
}

/**
 * Class to implement strategy of manual selection of root members for root block.
 * @constructor
 */
function ManualRootGenerator() {

  this.findNewCertsFromWoT = function() {
    return Q({});
  };

  this.filterJoiners = function(preJoinData, next) {
    var joinData = {};
    var newcomers = _(preJoinData).keys();
    var uids = [];
    newcomers.forEach(function(newcomer){
      uids.push(preJoinData[newcomer].ms.userid);
    });
    if (newcomers.length > 0) {
      inquirer.prompt([{
        type: "checkbox",
        name: "uids",
        message: "Newcomers to add",
        choices: uids,
        default: uids[0]
      }], function (answers) {
        newcomers.forEach(function(newcomer){
          if (~answers.uids.indexOf(preJoinData[newcomer].ms.userid))
            joinData[newcomer] = preJoinData[newcomer];
        });
        if (answers.uids.length == 0)
          next('No newcomer selected');
        else
          next(null, joinData);
      });
    } else {
      next('No newcomer found');
    }
  };
}