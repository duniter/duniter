"use strict";

var path            = require('path');
var async           = require('async');
var _               = require('underscore');
var co               = require('co');
var Q               = require('q');
var moment          = require('moment');
var inquirer        = require('inquirer');
var childProcess    = require('child_process');
var hashf           = require('../lib/hashf');
var base58          = require('../lib/base58');
var signature       = require('../lib/signature');
var constants       = require('../lib/constants');
var localValidator  = require('../lib/localValidator');
var globalValidator = require('../lib/globalValidator');
var blockchainDao   = require('../lib/blockchainDao');
var blockchainCtx   = require('../lib/blockchainContext');

const CHECK_ALL_RULES = true;

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

// Flag indicating the PoW has begun
var computing = false;

var blockFifo = async.queue(function (task, callback) {
  task(callback);
}, 1);

function BlockchainService (conf, mainDAL, pair) {

  var that = this;
  var mainContext = blockchainCtx(conf, mainDAL);
  var logger = require('../lib/logger')(mainDAL.profile);
  var selfPubkey = base58.encode(pair.publicKey);

  var lastGeneratedWasWrong = false;

  var Identity      = require('../lib/entity/identity');
  var Certification = require('../lib/entity/certification');
  var Membership    = require('../lib/entity/membership');
  var Block         = require('../lib/entity/block');
  var Transaction   = require('../lib/entity/transaction');

  var statTests = {
    'newcomers': 'identities',
    'certs': 'certifications',
    'joiners': 'joiners',
    'actives': 'actives',
    'leavers': 'leavers',
    'revoked': 'revoked',
    'excluded': 'excluded',
    'ud': 'dividend',
    'tx': 'transactions'
  };
  let statNames = ['newcomers', 'certs', 'joiners', 'actives', 'leavers', 'revoked', 'excluded', 'ud', 'tx'];

  this.init = function(done) {
    that.currentDal = mainDAL;
    done();
  };

  this.current = (done) =>
    mainDAL.getCurrentBlockOrNull(done);

  this.promoted = (number) => co(function *() {
    let bb = yield mainDAL.getPromoted(number);
    if (!bb) throw constants.ERRORS.BLOCK_NOT_FOUND;
    return bb;
  });

  this.checkBlock = function(block) {
    return mainContext.checkBlock(block);
  };

  this.branches = () => co(function *() {
    let forkBlocks = yield mainDAL.blockDAL.getForkBlocks();
    forkBlocks = _.sortBy(forkBlocks, 'number');
    // Get the blocks refering current blockchain
    let forkables = [];
    for (let i = 0; i < forkBlocks.length; i++) {
      let block = forkBlocks[i];
      let refered = yield mainDAL.getBlockByNumberAndHashOrNull(block.number - 1, block.previousHash);
      if (refered) {
        forkables.push(block);
      }
    }
    let branches = getBranches(forkables, _.difference(forkBlocks, forkables));
    let current = yield mainContext.current();
    let forks = branches.map((branch) => branch[branch.length - 1]);
    return forks.concat([current]);
  });

  function getBranches(forkables, others) {
    // All starting branches
    let branches = forkables.map((fork) => [fork]);
    // For each "pending" block, we try to add it to all branches
    for (let i = 0, len = others.length; i < len; i++) {
      let other = others[i];
      for (let j = 0, len2 = branches.length; j < len2; j++) {
        let branch = branches[j];
        let last = branch[branch.length - 1];
        if (other.number == last.number + 1 && other.previousHash == last.hash) {
          branch.push(other);
        } else if (branch[1]) {
          // We try to find out if another fork block can be forked
          let diff = other.number - branch[0].number;
          if (diff > 0 && branch[diff - 1] && branch[diff - 1].hash == other.previousHash) {
            // We duplicate the branch, and we add the block to this second branch
            branches.push(branch.slice());
            // First we remove the blocks that are not part of the fork
            branch.splice(diff, branch.length - diff);
            branch.push(other);
            j++;
          }
        }
      }
    }
    branches = _.sortBy(branches, (branch) => -branch.length);
    if (branches.length) {
      let maxSize = branches[0].length;
      let longestsBranches = [];
      for (let i = 0, len = branches.length; i < len; i++) {
        let branch = branches[i];
        if (branch.length == maxSize) {
          longestsBranches.push(branch);
        }
      }
      return longestsBranches;
    }
    return [];
  }

  this.submitBlock = function (obj, doCheck) {
    return Q.Promise(function(resolve, reject){
      // FIFO: only admit one block at a time
      blockFifo.push(function(blockIsProcessed) {
        return co(function *() {
          let res = yield checkAndAddBlock(obj, doCheck);
          resolve(res);
          blockIsProcessed();
        })
          .catch((err) => {
            reject(err);
            blockIsProcessed();
          });
      });
    });
  };

  function checkAndAddBlock(obj, doCheck) {
    return co(function *() {
      let existing = yield mainDAL.getBlockByNumberAndHashOrNull(obj.number, obj.hash);
      if (existing) {
        throw 'Already processed';
      }
      let current = yield mainContext.current();
      let followsCurrent = !current || (obj.number == current.number + 1 && obj.previousHash == current.hash);
      if (followsCurrent) {
        // try to add it on main blockchain
        if (doCheck) {
          yield mainContext.checkBlock(obj, constants.WITH_SIGNATURES_AND_POW);
        }
        let res = yield mainContext.addBlock(obj, doCheck);
        yield pushStatsForBlocks([res]);
        yield Q.nfcall(that.stopPoWThenProcessAndRestartPoW.bind(that));
        return res;
      } else {
        // add it as side chain
        if (current.number - obj.number + 1 >= conf.forksize) {
          throw 'Block out of fork window';
        }
        let absolute = yield mainDAL.getAbsoluteBlockByNumberAndHash(obj.number, obj.hash);
        if (absolute) {
          throw 'Already processed side block #' + obj.number + '-' + obj.hash;
        }
        let res = yield mainContext.addSideBlock(obj, doCheck);
        yield that.tryToFork(current);
        return res;
      }
    });
  }

  that.tryToFork = (current) => co(function *() {
    yield eventuallySwitchOnSideChain(current);
    let newCurrent = yield mainContext.current();
    let forked = newCurrent.number != current.number || newCurrent.hash != current.hash;
    if (forked) {
      yield Q.nfcall(that.stopPoWThenProcessAndRestartPoW.bind(that));
    }
  });

  function eventuallySwitchOnSideChain(current) {
    return co(function *() {
      let branches = yield that.branches();
      let potentials = _.without(branches, current);
      potentials = _.filter(potentials, (p) => p.number - current.number > constants.BRANCHES.SWITCH_ON_BRANCH_AHEAD_BY);
      logger.trace('SWITCH: %s branches...', branches.length);
      logger.trace('SWITCH: %s potential side chains...', potentials.length);
      for (let i = 0, len = potentials.length; i < len; i++) {
        let potential = potentials[i];
        logger.info('SWITCH: get side chain #%s-%s...', potential.number, potential.hash);
        let sideChain = yield getWholeForkBranch(potential);
        logger.info('SWITCH: revert main chain to block #%s...', sideChain[0].number - 1);
        yield revertToBlock(sideChain[0].number - 1);
        try {
          logger.info('SWITCH: apply side chain #%s-%s...', potential.number, potential.hash);
          yield applySideChain(sideChain);
        } catch (e) {
          logger.warn('SWITCH: error %s', e.stack || e);
          // Revert the revert (so we go back to original chain)
          let revertedChain = yield getWholeForkBranch(current);
          yield revertToBlock(revertedChain[0].number - 1);
          yield applySideChain(revertedChain);
          yield markSideChainAsWrong(sideChain);
        }
      }
    });
  }

  function getWholeForkBranch(topForkBlock) {
    return co(function *() {
      let fullBranch = [];
      let isForkBlock = true;
      let next = topForkBlock;
      while (isForkBlock) {
        fullBranch.push(next);
        logger.trace('SWITCH: get absolute #%s-%s...', next.number - 1, next.previousHash);
        next = yield mainDAL.getAbsoluteBlockByNumberAndHash(next.number - 1, next.previousHash);
        isForkBlock = next.fork;
      }
      //fullBranch.push(next);
      // Revert order so we have a crescending branch
      return fullBranch.reverse();
    });
  }

  function revertToBlock(number) {
    return co(function *() {
      let nowCurrent = yield that.current();
      logger.trace('SWITCH: main chain current = #%s-%s...', nowCurrent.number, nowCurrent.hash);
      while (nowCurrent.number > number) {
        logger.trace('SWITCH: main chain revert #%s-%s...', nowCurrent.number, nowCurrent.hash);
        yield mainContext.revertCurrentBlock();
        nowCurrent = yield that.current();
      }
    });
  }

  function applySideChain(chain) {
    return co(function *() {
      for (let i = 0, len = chain.length; i < len; i++) {
        let block = chain[i];
        logger.trace('SWITCH: apply side block #%s-%s -> #%s-%s...', block.number, block.hash, block.number - 1, block.previousHash);
        yield checkAndAddBlock(block, CHECK_ALL_RULES);
      }
    });
  }

  function markSideChainAsWrong(chain) {
    return co(function *() {
      for (let i = 0, len = chain.length; i < len; i++) {
        let block = chain[i];
        block.wrong = true;
        // Saves the block (DAL)
        yield mainDAL.saveSideBlockInFile(block);
      }
    });
  }

  this.revertCurrentBlock = () =>
    Q.Promise(function(resolve, reject){
      // FIFO: only admit one block at a time
      blockFifo.push(function(blockIsProcessed) {
        return co(function *() {
          yield mainContext.revertCurrentBlock();
          resolve();
          blockIsProcessed();
        })
          .catch((err) => {
            reject(err);
            blockIsProcessed();
          });
      });
    });

  this.stopPoWThenProcessAndRestartPoW = function (done) {
    // If PoW computation process is waiting, trigger it
    if (computeNextCallback)
      computeNextCallback();
    if (conf.participate && !cancels.length && computing) {
      powFifo.push(function (taskDone) {
        cancels.push(taskDone);
      });
    }
    done();
  };

  function checkWoTConstraints (block, newLinks, current, done) {
    return co(function *() {
      if (block.number < 0) {
        throw 'Cannot compute WoT constraint for negative block number';
      }
      let newcomers = block.joiners.map((inlineMS) => inlineMS.split(':')[0]);
      let realNewcomers = block.identities;
      for (let i = 0, len = newcomers.length; i < len; i++) {
        let newcomer = newcomers[i];
        if (block.number > 0) {
          try {
            // Will throw an error if not enough links
            yield Q.nbind(mainContext.checkHaveEnoughLinks, mainContext)(newcomer, newLinks);
            // This one does not throw but returns a boolean
            let isOut = yield that.isOver3Hops(newcomer, newLinks, realNewcomers, current);
            if (isOut) {
              throw 'Key ' + newcomer + ' is not recognized by the WoT for this block';
            }
          } catch (e) {
            logger.debug(e);
            throw e;
          }
        }
      }
    })
      .then(() => done())
      .catch(done);
  }

  function getSentryMembers(dal, members, done) {
    var sentries = [];
    async.forEachSeries(members, function (m, callback) {
      async.waterfall([
        function (next) {
          dal.getValidLinksFrom(m.pubkey).then(_.partial(next, null)).catch(next);
        },
        function (links, next) {
          // Only test agains members who make enough signatures
          if (links.length >= conf.xpercent) {
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
        if (!block) {
          return that.generateNextBlock(mainDAL, new ManualRootGenerator()).then(_.partial(next, null)).catch(next);
        }
        else
          next('Cannot generate root block: it already exists.');
      }
    ], done);
  };

  function iteratedChecking(newcomers, checkWoTForNewcomers, done) {
    return Q.Promise(function(resolve){
      var passingNewcomers = [], hadError = false;
      async.forEachSeries(newcomers, function(newcomer, callback){
        checkWoTForNewcomers(passingNewcomers.concat(newcomer), function (err) {
          // If success, add this newcomer to the valid newcomers. Otherwise, reject him.
          if (!err) {
            passingNewcomers.push(newcomer);
          }
          hadError = hadError || err;
          callback();
        });
      }, function(){
        if (hadError) {
          // If at least one newcomer was rejected, test the whole new bunch
          resolve(iteratedChecking(passingNewcomers, checkWoTForNewcomers));
        }
        else {
          resolve(passingNewcomers);
        }
      });
    })
      .then(function(passingNewcomers) {
        done && done(null, passingNewcomers);
        return passingNewcomers;
      })
      .catch(done);
  }

  /**
   * Generates next block, finding newcomers, renewers, leavers, certs, transactions, etc.
   */
  this.generateNext = function () {
    return co(function *() {
      var dal = mainDAL;
      return that.generateNextBlock(dal, new NextBlockGenerator(conf, dal));
    });
  };

  /**
  * Generate next block, gathering both updates & newcomers
  */
  this.generateNextBlock = function (dal, generator) {
    return co(function *() {
      var current = yield dal.getCurrentBlockOrNull();
      var lastUDBlock = yield dal.lastUDBlock();
      var revocations = yield dal.getRevocatingMembers();
      var exclusions = yield dal.getToBeKickedPubkeys();
      var newCertsFromWoT = yield generator.findNewCertsFromWoT(current);
      var newcomersLeavers = yield findNewcomersAndLeavers(dal, current, generator.filterJoiners);
      var transactions = yield findTransactions(dal);
      var joinData = newcomersLeavers[2];
      var leaveData = newcomersLeavers[3];
      var newCertsFromNewcomers = newcomersLeavers[4];
      var certifiersOfNewcomers = _.uniq(_.keys(joinData).reduce(function(certifiers, newcomer) {
        return certifiers.concat(_.pluck(joinData[newcomer].certs, 'from'));
      }, []));
      var certifiers = [].concat(certifiersOfNewcomers);
      // Merges updates
      _(newCertsFromWoT).keys().forEach(function(certified){
        newCertsFromWoT[certified] = newCertsFromWoT[certified].filter(function(cert) {
          // Must not certify a newcomer, since it would mean multiple certifications at same time from one member
          var isCertifier = certifiers.indexOf(cert.from) != -1;
          if (!isCertifier) {
            certifiers.push(cert.from);
          }
          return !isCertifier;
        });
      });
      _(newCertsFromNewcomers).keys().forEach(function(certified){
        newCertsFromWoT[certified] = (newCertsFromWoT[certified] || []).concat(newCertsFromNewcomers[certified]);
      });
      // Revocations
      // Create the block
      return createBlock(dal, current, joinData, leaveData, newCertsFromWoT, revocations, exclusions, lastUDBlock, transactions);
    });
  };

  /**
  * Generate next block, gathering both updates & newcomers
  */
  this.generateEmptyNextBlock = function () {
    return co(function *() {
      var dal = mainDAL;
      var current = yield dal.getCurrentBlockOrNull();
      var lastUDBlock = dal.lastUDBlock();
      var exclusions = yield dal.getToBeKickedPubkeys();
      return createBlock(dal, current, {}, {}, {}, [], exclusions, lastUDBlock, []);
    });
  };

  function findTransactions(dal) {
    return dal.getTransactionsPending()
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
                globalValidation.checkSingleTransaction(extractedTX, { medianTime: moment().utc().unix() }, next);
              },
              function (next) {
                transactions.push(tx);
                passingTxs.push(extractedTX);
                next();
              }
            ], function (err) {
              if (err) {
                logger.error(err);
                dal.removeTxByHash(extractedTX.hash).then(_.partial(callback, null)).catch(callback);
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

  function findNewcomersAndLeavers (dal, current, filteringFunc) {
    return Q.Promise(function(resolve, reject){
      async.parallel({
        newcomers: function(callback){
          findNewcomers(dal, current, filteringFunc, callback);
        },
        leavers: function(callback){
          findLeavers(dal, current, callback);
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

  function findLeavers (dal, current, done) {
    var leaveData = {};
    async.waterfall([
      function (next){
        dal.findLeavers().then(_.partial(next, null)).catch(next);
      },
      function (mss, next){
        var leavers = [];
        mss.forEach(function (ms) {
          leavers.push(ms.issuer);
        });
        async.forEach(mss, function(ms, callback){
          var leave = { identity: null, ms: ms, key: null, idHash: '' };
          leave.idHash = (hashf(ms.userid + ms.certts + ms.issuer) + "").toUpperCase();
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

  function findNewcomers (dal, current, filteringFunc, done) {
    var wotMembers = [];
    var joinData = {};
    var updates = {};
    async.waterfall([
      function (next) {
        getPreJoinData(dal, current, next);
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
        wotMembers = _.pluck(members, 'pubkey');
        // Checking step
        var newcomers = _(joinData).keys();
        var nextBlockNumber = current ? current.number + 1 : 0;
        // Checking algo is defined by 'checkingWoTFunc'
        iteratedChecking(newcomers, function (someNewcomers, onceChecked) {
          var nextBlock = {
            number: nextBlockNumber,
            joiners: someNewcomers,
            identities: _.filter(newcomers.map((pub) => joinData[pub].identity), { wasMember: false }).map((idty) => idty.pubkey)
          };
          // Check WoT stability
          async.waterfall([
            function (next){
              computeNewLinks(nextBlockNumber, dal, someNewcomers, joinData, updates, next);
            },
            function (newLinks, next){
              checkWoTConstraints(nextBlock, newLinks, current, next);
            }
          ], (err) => {
            onceChecked(err);
          });
        }, function (err, realNewcomers) {
          err && logger.error(err);
          async.waterfall([
            function (next){
              computeNewLinks(nextBlockNumber, dal, realNewcomers, joinData, updates, next);
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

  function getPreJoinData(dal, current, done) {
    var preJoinData = {};
    async.waterfall([
      function (next){
        dal.findNewcomers().then(_.partial(next, null)).catch(next);
      },
      function (mss, next){
        var joiners = [];
        mss.forEach(function (ms) {
          joiners.push(ms.issuer);
        });
        async.forEach(mss, function(ms, callback){
          async.waterfall([
            function(nextOne) {
              if (current) {
                dal.getBlockOrNull(ms.number, nextOne);
              } else {
                nextOne(null, {});
              }
            },
            function(block, nextOne) {
              if (!block) {
                return nextOne('Block not found for membership');
              }
              var idtyHash = (hashf(ms.userid + ms.certts + ms.issuer) + "").toUpperCase();
              getSinglePreJoinData(dal, current, idtyHash, nextOne, joiners);
            },
            function(join, nextOne) {
              join.ms = ms;
              if (!join.identity.revoked && join.identity.currentMSN < parseInt(join.ms.number)) {
                preJoinData[join.identity.pubkey] = join;
              }
              nextOne();
            }
          ], (err) => {
            if (err) {
              logger.warn(err);
            }
            callback();
          });
        }, next);
      }
    ], function(err) {
      done(err, preJoinData);
    });
  }

  this.requirementsOfIdentities = (identities) => co(function *() {
    let all = [];
    let current = yield that.currentDal.getCurrent();
    for (let i = 0, len = identities.length; i < len; i++) {
      let idty = new Identity(identities[i]);
      let reqs = yield that.requirementsOfIdentity(idty, current);
      all.push(reqs);
    }
    return all;
  });

  this.requirementsOfIdentity = (idty, current) => co(function *() {
    // TODO: this is not clear
    let join = yield Q.nfcall(getSinglePreJoinData, that.currentDal, current, idty.hash);
    let pubkey = join.identity.pubkey;
    // Check WoT stability
    let someNewcomers = join.identity.wasMember ? [] : [join.identity.pubkey];
    let nextBlockNumber = current ? current.number + 1 : 0;
    let joinData = {};
    joinData[join.identity.pubkey] = join;
    let updates = {};
    let newCerts = yield computeNewCerts(nextBlockNumber, that.currentDal, [join.identity.pubkey], joinData, updates);
    let newLinks = newCertsToLinks(newCerts, updates);
    let certs = yield that.getValidCerts(pubkey, newCerts);
    let outdistanced = yield that.isOver3Hops(pubkey, newLinks, someNewcomers, current);
    let expiresMS = 0;
    let currentTime = current ? current.medianTime : 0;
    // Expiration of current membershship
    if (join.identity.currentMSN >= 0) {
      let msBlock = yield that.currentDal.getBlockOrNull(join.identity.currentMSN);
      expiresMS = Math.max(0, (msBlock.medianTime + conf.msValidity - currentTime));
    }
    // Expiration of pending membership
    let expiresPending = 0;
    let lastJoin = yield that.currentDal.lastJoinOfIdentity(idty.hash);
    if (lastJoin) {
      let msBlock = yield that.currentDal.getBlockOrNull(lastJoin.blockNumber);
      expiresPending = Math.max(0, (msBlock.medianTime + conf.msValidity - currentTime));
    }
    // Expiration of certifications
    for (let i = 0, len = certs.length; i < len; i++) {
      let cert = certs[i];
      cert.expiresIn = Math.max(0, cert.timestamp + conf.sigValidity - currentTime);
    }
    return {
      pubkey: join.identity.pubkey,
      uid: join.identity.uid,
      meta: {
        timestamp: join.identity.buid
      },
      outdistanced: outdistanced,
      certifications: certs,
      membershipPendingExpiresIn: expiresPending,
      membershipExpiresIn: expiresMS
    };
  });

  this.getValidCerts = (newcomer, newCerts) => co(function *() {
    let links = yield that.currentDal.getValidLinksTo(newcomer);
    let certsFromLinks = links.map((lnk) => { return { from: lnk.source, to: lnk.target, timestamp: lnk.timestamp }; });
    let certsFromCerts = [];
    let certs = newCerts[newcomer] || [];
    for (let i = 0, len = certs.length; i < len; i++) {
      let cert = certs[i];
      let block = yield that.currentDal.getBlockOrNull(cert.block_number);
      certsFromCerts.push({
        from: cert.from,
        to: cert.to,
        timestamp: block.medianTime
      });
    }
    return certsFromLinks.concat(certsFromCerts);
  });

  this.isOver3Hops = function(newcomer, newLinks, otherNewcomers, current) {
    return co(function *() {
      if (!current) {
        return Q(false);
      }
      let gvalidator = globalValidator(conf, blockchainDao(null, that.currentDal));
      try {
        yield Q.nbind(gvalidator.isOver3Hops, gvalidator)(newcomer, newLinks, otherNewcomers);
        return false;
      } catch (e) {
        return true;
      }
    });
  };

  function getSinglePreJoinData(dal, current, idHash, done, joiners) {
    return co(function *() {
      var gValidator = globalValidator(conf, blockchainDao(null, that.currentDal));
      var identity = yield dal.getIdentityByHashOrNull(idHash);
      var foundCerts = [];
      let blockOfChainability = current ? (yield dal.getChainabilityBlock(current.medianTime, conf.sigPeriod)) : null;
      if (!identity) {
        throw 'Identity with hash \'' + idHash + '\' not found';
      }
      if (!identity.leaving) {
        if (!current) {
          // Look for certifications from initial joiners
          // TODO: check if this is still working
          let certs = yield dal.certsNotLinkedToTarget(idHash);
          foundCerts = _.filter(certs, function(cert){
            return ~joiners.indexOf(cert.from);
          });
        } else {
          // Look for certifications from WoT members
          let certs = yield dal.certsNotLinkedToTarget(idHash);
          var certifiers = [];
          for (let i = 0; i < certs.length; i++) {
            let cert = certs[i];
            try {
              var basedBlock = yield dal.getBlock(cert.block_number);
              if (current) {
                let age = current.medianTime - basedBlock.medianTime;
                if (age > conf.sigWindow || age > conf.sigValidity) {
                  throw 'Too old certification';
                }
              }
              // Already exists a link not replayable yet?
              var exists = yield dal.existsLinkFromOrAfterDate(cert.from, cert.to, current.medianTime - conf.sigValidity);
              if (exists) {
                throw 'It already exists a similar certification written, which is not replayable yet';
              }
              // Already exists a link not chainable yet?
              exists = yield dal.existsNonChainableLink(cert.from, blockOfChainability.number, conf.sigStock);
              if (exists) {
                throw 'It already exists a certification written which is not chainable yet';
              }
              var isMember = yield dal.isMember(cert.from);
              var doubleSignature = ~certifiers.indexOf(cert.from) ? true : false;
              if (isMember && !doubleSignature) {
                var isValid = yield gValidator.checkCertificationIsValidForBlock(cert, { number: current.number + 1, currency: current.currency }, identity);
                if (isValid) {
                  certifiers.push(cert.from);
                  foundCerts.push(cert);
                }
              }
            } catch (e) {
              // Go on
            }
          }
        }
      }
      return {
        identity: identity,
        key: null,
        idHash: idHash,
        certs: foundCerts
      };
    })
      .then((join) => done(null, join))
      .catch(done);
  }

  function computeNewCerts(forBlock, dal, theNewcomers, joinData) {
    return co(function *() {
      var newCerts = {}, certifiers = [];
      var certsByKey = _.mapObject(joinData, function(val){ return val.certs; });
      for (let i = 0, len = theNewcomers.length; i < len; i++) {
        let newcomer = theNewcomers[i];
        // New array of certifiers
        newCerts[newcomer] = newCerts[newcomer] || [];
        // Check wether each certification of the block is from valid newcomer/member
        for (let j = 0, len2 = certsByKey[newcomer].length; j < len2; j++) {
          let cert = certsByKey[newcomer][j];
          let isAlreadyCertifying = certifiers.indexOf(cert.from) !== -1;
          if (!(isAlreadyCertifying && forBlock > 0)) {
            if (~theNewcomers.indexOf(cert.from)) {
              // Newcomer to newcomer => valid link
              newCerts[newcomer].push(cert);
              certifiers.push(cert.from);
            } else {
              let isMember = yield dal.isMember(cert.from);
              // Member to newcomer => valid link
              if (isMember) {
                newCerts[newcomer].push(cert);
                certifiers.push(cert.from);
              }
            }
          }
        }
      }
      return newCerts;
    });
  }

  function newCertsToLinks(newCerts, updates) {
    let newLinks = {};
    _.mapObject(newCerts, function(certs, pubkey) {
      newLinks[pubkey] = _.pluck(certs, 'from');
    });
    _.mapObject(updates, function(certs, pubkey) {
      newLinks[pubkey] = (newLinks[pubkey] || []).concat(_.pluck(certs, 'pubkey'));
    });
    return newLinks;
  }

  function computeNewLinksP(forBlock, dal, theNewcomers, joinData, updates) {
    return co(function *() {
      let newCerts = yield computeNewCerts(forBlock, dal, theNewcomers, joinData);
      return newCertsToLinks(newCerts, updates);
    });
  }

  function computeNewLinks (forBlock, dal, theNewcomers, joinData, updates, done) {
    return computeNewLinksP(forBlock, dal, theNewcomers, joinData, updates)
      .catch((err) => {
        done && done(err);
        throw err;
      })
      .then((res) => {
        done && done(null, res);
        return res;
      });
  }

  function createBlock (dal, current, joinData, leaveData, updates, revocations, exclusions, lastUDBlock, transactions) {
    // Revocations have an impact on exclusions
    revocations.forEach((idty) => exclusions.push(idty.pubkey));
    // Prevent writing joins/updates for excluded members
    exclusions = _.uniq(exclusions);
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
    block.version = constants.DOCUMENTS_VERSION;
    block.currency = current ? current.currency : conf.currency;
    block.nonce = 0;
    block.number = current ? current.number + 1 : 0;
    block.parameters = block.number > 0 ? '' : [
      conf.c, conf.dt, conf.ud0,
      conf.sigPeriod, conf.sigStock, conf.sigWindow, conf.sigValidity,
      conf.sigQty, conf.xpercent, conf.msValidity,
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
      throw 'Wrong new block: cannot make a root block without members';
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
    block.identities = _.sortBy(block.identities, (line) => {
      let sp = line.split(':');
      return sp[2] + sp[3];
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
    block.revoked = revocations.map((idty) => [idty.pubkey, idty.revocation_sig].join(':'));
    // Kicked people
    block.excluded = exclusions;
    // Final number of members
    block.membersCount = previousCount + block.joiners.length - block.excluded.length;

    //----- Certifications -----

    // Certifications from the WoT, to newcomers
    block.certifications = [];
    joiners.forEach(function(joiner){
      var data = joinData[joiner] || [];
      data.certs.forEach(function(cert){
        block.certifications.push(new Certification(cert).inline());
      });
    });
    // Certifications from the WoT, to the WoT
    _(updates).keys().forEach(function(certifiedMember){
      var certs = updates[certifiedMember] || [];
      certs.forEach(function(cert){
        block.certifications.push(new Certification(cert).inline());
      });
    });
    // Transactions
    block.transactions = [];
    transactions.forEach(function (tx) {
      block.transactions.push({ raw: tx.compact() });
    });
    return co(function *() {
      block.powMin = block.number == 0 ? 0 : yield globalValidator(conf, blockchainDao(block, dal)).getPoWMin(block.number);
      if (block.number == 0) {
        block.medianTime = moment.utc().unix() - conf.rootoffset;
      }
      else {
        block.medianTime = yield globalValidator(conf, blockchainDao(block, dal)).getMedianTime(block.number);
      }
      // Universal Dividend
      var lastUDTime = lastUDBlock && lastUDBlock.UDTime;
      if (!lastUDTime) {
        let rootBlock = yield dal.getBlockOrNull(0);
        lastUDTime = rootBlock && rootBlock.UDTime;
      }
      if (lastUDTime != null) {
        if (current && lastUDTime + conf.dt <= block.medianTime) {
          var M = current.monetaryMass || 0;
          var c = conf.c;
          var N = block.membersCount;
          var previousUD = lastUDBlock ? lastUDBlock.dividend : conf.ud0;
          if (N > 0) {
            block.dividend = Math.ceil(Math.max(previousUD, c * M / N));
          } else {
            // The community has collapsed. RIP.
            block.dividend = 0;
          }
        }
      }
      return block;
    });
  }

  var debug = process.execArgv.toString().indexOf('--debug') !== -1;
  if(debug) {
    //Set an unused port number.
    process.execArgv = [];
  }
  var powWorker;

  this.prove = function (block, sigFunc, difficulty, done, forcedTime) {

    var remainder = difficulty % 4;
    var nbZeros = (difficulty - remainder) / 4;
    var highMark = remainder == 3 ? constants.PROOF_OF_WORK.UPPER_BOUND.LEVEL_3
      : (remainder == 2 ? constants.PROOF_OF_WORK.UPPER_BOUND.LEVEL_2
      : (remainder == 1 ?constants.PROOF_OF_WORK.UPPER_BOUND.LEVEL_1
      : constants.PROOF_OF_WORK.UPPER_BOUND.LEVEL_0));

    return Q.Promise(function(resolve, reject){
      if (!powWorker) {
        powWorker = new Worker();
      }
      if (block.number == 0) {
        // On initial block, difficulty is the one given manually
        block.powMin = difficulty;
      }
      // Start
      powWorker.setOnPoW(function(err, powBlock) {
        var theBlock = (powBlock && new Block(powBlock)) || null;
        resolve(theBlock);
        done && done(null, theBlock);
      });

      powWorker.setOnError((err) => {
        reject(err);
      });

      block.nonce = 0;
      powWorker.powProcess.send({ conf: conf, block: block, zeros: nbZeros, highMark: highMark, forcedTime: forcedTime,
        pair: {
          secretKeyEnc: base58.encode(pair.secretKey)
        }
      });
      logger.info('Generating proof-of-work with %s leading zeros followed by [0-' + highMark + ']... (CPU usage set to %s%)', nbZeros, (conf.cpu * 100).toFixed(0));
    });
  };

  function Worker() {

    var stopped = true;
    var that = this;
    var onPoWFound = function() { throw 'Proof-of-work found, but no listener is attached.'; };
    var onPoWError = function() { throw 'Proof-of-work error, but no listener is attached.'; };
    that.powProcess = childProcess.fork(path.join(__dirname, '/../lib/proof'));
    var start = null;
    var speedMesured = false;

    that.powProcess.on('message', function(msg) {
      var block = msg.block;
      if (msg.error) {
        onPoWError(msg.error);
        stopped = true;
      }
      if (stopped) {
        // Started...
        start = new Date();
        stopped = false;
      }
      if (!stopped && msg.found) {
        var end = new Date();
        var duration = (end.getTime() - start.getTime());
        var testsPerSecond = (1000 / duration * msg.testsCount).toFixed(2);
        logger.info('Done: %s in %ss (%s tests, ~%s tests/s)', msg.pow, (duration / 1000).toFixed(2), msg.testsCount, testsPerSecond);
        stopped = true;
        start = null;
        block.hash = msg.pow;
        onPoWFound(null, block);
      } else if (!stopped && msg.testsPerRound) {
        logger.info('Mesured max speed is ~%s tests/s. Proof will try with ~%s tests/s.', msg.testsPerSecond, msg.testsPerRound);
        speedMesured = true;
      } else if (!stopped && msg.nonce > block.nonce + constants.PROOF_OF_WORK.RELEASE_MEMORY) {
        // Reset fork process (release memory)...
        logger.trace('Release mem... lastCount = %s, nonce = %s', block.nonce);
        block.nonce = msg.nonce;
        speedMesured = false;
        that.powProcess.kill();
        powWorker = new Worker();
        that.powProcess.send({ conf: conf, block: block, zeros: msg.nbZeros, pair: {
            secretKeyEnc: base58.encode(pair.secretKey)
          }
        });
      } else if (!stopped) {

        if (!msg.found) {
          var pow = msg.pow;
          for (let i = 5; i >= 3; i--) {
            var lowPowRegexp = new RegExp('^0{' + (i) + '}[^0]');
            if (pow.match(lowPowRegexp)) {
              logger.info('Matched %s zeros %s with Nonce = %s for block#%s', i, pow, msg.block.nonce, msg.block.number);
              break;
            }
          }
        }
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

    this.setOnError = function(onError) {
      onPoWError = onError;
    };
  }

  this.startGeneration = function () {
    return co(function *() {
      if (!conf.participate) {
        throw 'This node is configured for not participating to computing blocks.';
      }
      if (!selfPubkey) {
        throw 'No self pubkey found.';
      }
      var block, current;
      var dal = mainDAL;
      var isMember = yield dal.isMember(selfPubkey);
      var powCanceled = '';
      if (!isMember) {
        powCanceled = 'Local node is not a member. Waiting to be a member before computing a block.';
      }
      else {
        current = yield dal.getCurrentBlockOrNull();
        if (!current) {
          powCanceled = 'Waiting for a root block before computing new blocks';
        }
        else {
          var lastIssuedByUs = current.issuer == selfPubkey;
          if (lastIssuedByUs) {
            logger.warn('Waiting ' + conf.powDelay + 's before starting computing next block...');
            yield Q.Promise(function(resolve){
              var timeoutToClear = setTimeout(function() {
                clearTimeout(timeoutToClear);
                computeNextCallback = null;
                resolve();
              }, (conf.powDelay || 1) * 1000);
              // Offer the possibility to break waiting
              computeNextCallback = function() {
                powCanceled = 'Waiting canceled.';
                clearTimeout(timeoutToClear);
                resolve();
              };
            });
            if (powCanceled) {
              logger.warn(powCanceled);
              return null;
            }
          }
          var trial = yield globalValidator(conf, blockchainDao(null, dal)).getTrialLevel(selfPubkey);
          if (trial > (current.powMin + 1)) {
            powCanceled = 'Too high difficulty: waiting for other members to write next block';
          }
          else {
            var block2 = lastGeneratedWasWrong ?
              yield that.generateEmptyNextBlock() :
              yield that.generateNext();
            var signature2 = signature.sync(pair);
            var trial2 = yield globalValidator(conf, blockchainDao(block2, dal)).getTrialLevel(selfPubkey);
            computing = true;
            return yield that.makeNextBlock(block2, signature2, trial2);
          }
        }
      }
      if (powCanceled) {
        logger.warn(powCanceled);
        return Q.Promise(function(resolve){
          computeNextCallback = resolve;
        });
      }
    })
      .then(function(block){
        computing = false;
        return block;
      });
  };

  this.makeNextBlock = function(block, sigFunc, trial, manualValues) {
    return co(function *() {
      var dal = mainDAL;
      var unsignedBlock = block || (yield that.generateNext());
      var sigF = sigFunc || signature.sync(pair);
      var trialLevel = trial || (yield globalValidator(conf, blockchainDao(block, dal)).getTrialLevel(selfPubkey));
      return that.prove(unsignedBlock, sigF, trialLevel, null, (manualValues && manualValues.time) || null);
    });
  };

  this.saveParametersForRootBlock = (block) => co(function *() {
    let mainFork = mainContext;
    let rootBlock = block || (yield mainFork.dal.getBlockOrNull(0));
    if (!rootBlock) throw 'Cannot registrer currency parameters since no root block exists';
    return mainFork.saveParametersForRootBlock(rootBlock);
  });

  function getParameters(block) {
    var sp = block.parameters.split(':');
    let theConf = {};
    theConf.c                = parseFloat(sp[0]);
    theConf.dt               = parseInt(sp[1]);
    theConf.ud0              = parseInt(sp[2]);
    theConf.sigPeriod        = parseInt(sp[3]);
    theConf.sigStock         = parseInt(sp[4]);
    theConf.sigWindow        = parseInt(sp[5]);
    theConf.sigValidity      = parseInt(sp[6]);
    theConf.sigQty           = parseInt(sp[7]);
    theConf.xpercent         = parseFloat(sp[8]);
    theConf.msValidity       = parseInt(sp[9]);
    theConf.stepMax          = parseInt(sp[10]);
    theConf.medianTimeBlocks = parseInt(sp[11]);
    theConf.avgGenTime       = parseInt(sp[12]);
    theConf.dtDiffEval       = parseInt(sp[13]);
    theConf.blocksRot        = parseInt(sp[14]);
    theConf.percentRot       = parseFloat(sp[15]);
    theConf.currency         = block.currency;
    return theConf;
  }

  function getMaxBlocksToStoreAsFile(aConf) {
    return Math.floor(Math.max(aConf.dt / aConf.avgGenTime, aConf.medianTimeBlocks, aConf.dtDiffEval, aConf.blocksRot) * constants.SAFE_FACTOR);
  }

  this.saveBlocksInMainBranch = (blocks, targetLastNumber) => co(function *() {
    // VERY FIRST: parameters, otherwise we compute wrong variables such as UDTime
    if (blocks[0].number == 0) {
      yield that.saveParametersForRootBlock(blocks[0]);
    }
    // Helper to retrieve a block with local cache
    let getBlockOrNull = (number) => {
      let firstLocalNumber = blocks[0].number;
      if (number >= firstLocalNumber) {
        let offset = number - firstLocalNumber;
        return Q(blocks[offset]);
      }
      return mainDAL.getBlockOrNull(number);
    };
    // Insert a bunch of blocks
    let lastPrevious = blocks[0].number == 0 ? null : yield mainDAL.getBlock(blocks[0].number - 1);
    let rootBlock = (blocks[0].number == 0 ? blocks[0] : null) || (yield mainDAL.getBlockOrNull(0));
    let rootConf = getParameters(rootBlock);
    let maxBlock = getMaxBlocksToStoreAsFile(rootConf);
    let lastBlockToSave = blocks[blocks.length - 1];
    for (let i = 0; i < blocks.length; i++) {
      let previous = i > 0 ? blocks[i - 1] : lastPrevious;
      let block = blocks[i];
      block.fork = false;
      //console.log('Block #%s', block.number);
      // Monetary mass & UD Time recording before inserting elements
      block.monetaryMass = (previous && previous.monetaryMass) || 0;
      block.dividend = block.dividend || 0;
      // UD Time update
      let previousBlock = i > 0 ? blocks[i - 1] : lastPrevious;
      if (block.number == 0) {
        block.UDTime = block.medianTime; // Root = first UD time
      }
      else if (block.dividend) {
        block.UDTime = conf.dt + previousBlock.UDTime;
        block.monetaryMass += block.dividend * block.membersCount;
      } else {
        block.UDTime = previousBlock.UDTime;
      }
      yield Q.Promise(function(resolve, reject){
        // Create/Update members (create new identities if do not exist)
        mainContext.updateMembers(block, function (err) {
          if (err) return reject(err);
          resolve();
        });
      });
    }
    // Transactions recording
    yield mainContext.updateTransactionsForBlocks(blocks);
    // Create certifications
    yield mainContext.updateMembershipsForBlocks(blocks);
    // Create certifications
    yield mainContext.updateLinksForBlocks(blocks, getBlockOrNull);
    // Create certifications
    yield mainContext.updateCertificationsForBlocks(blocks);
    // Create / Update sources
    yield mainContext.updateTransactionSourcesForBlocks(blocks);
    yield mainDAL.blockDAL.saveBunch(blocks, (targetLastNumber - lastBlockToSave.number) > maxBlock);
    yield pushStatsForBlocks(blocks);
  });

  function pushStatsForBlocks(blocks) {
    let stats = {};
    // Stats
    for (let i = 0; i < blocks.length; i++) {
      let block = blocks[i];
      for (let j = 0; j < statNames.length; j++) {
        let statName = statNames[j];
        if (!stats[statName]) {
          stats[statName] = { blocks: [] };
        }
        let stat = stats[statName];
        var testProperty = statTests[statName];
        var value = block[testProperty];
        var isPositiveValue = value && typeof value != 'object';
        var isNonEmptyArray = value && typeof value == 'object' && value.length > 0;
        if (isPositiveValue || isNonEmptyArray) {
          stat.blocks.push(block.number);
        }
        stat.lastParsedBlock = block.number;
      }
    }
    return mainDAL.pushStats(stats);
  }

  this.obsoleteInMainBranch = (block) => Q.Promise(function(resolve, reject){
    async.waterfall([
      function (next){
        // Compute obsolete links
        mainContext.computeObsoleteLinks(block, next);
      },
      function (next){
        // Compute obsolete memberships (active, joiner)
        mainContext.computeObsoleteMemberships(block)
          .then(function() {
            next();
          })
          .catch(next);
      }
    ], function (err) {
      if (err) return reject(err);
      resolve();
    });
  });

  this.getCertificationsExludingBlock = function() {
    return that.currentDal.getCurrent()
      .then(function(current){
        return that.currentDal.getCertificationExcludingBlock(current, conf.sigValidity);
      })
      .catch(function(){
        return { number: -1 };
      });
  };

  this.blocksBetween = (from, count) => co(function *() {
    if (count > 5000) {
      throw 'Count is too high';
    }
    let current = yield that.current();
    count = Math.min(current.number - from + 1, count);
    if (!current || current.number < from) {
      throw 'Starting block #' + from + ' does not exist';
    }
    return mainContext.dal.getBlocksBetween(from, from + count - 1);
  });

  var cleanMemFifo = async.queue((task, callback) => task(callback), 1);
  var cleanMemFifoInterval = null;
  this.regularCleanMemory = function (done) {
    if (cleanMemFifoInterval)
      clearInterval(cleanMemFifoInterval);
    cleanMemFifoInterval = setInterval(() => cleanMemFifo.push(cleanMemory), 1000 * constants.MEMORY_CLEAN_INTERVAL);
    cleanMemory(done);
  };

  function cleanMemory(done) {
    mainDAL.blockDAL.migrateOldBlocks()
      .then(() => done())
      .catch((err) => {
        logger.warn(err);
        done();
      });
  }
}

/**
 * Class to implement strategy of automatic selection of incoming data for next block.
 * @constructor
 */
function NextBlockGenerator(conf, dal) {

  this.findNewCertsFromWoT = function(current) {
    return co(function *() {
      var updates = {};
      var updatesToFrom = {};
      var certs = yield dal.certsFindNew();
      // The block above which (above from current means blocks with number < current)
      let blockOfChainability = current ? (yield dal.getChainabilityBlock(current.medianTime, conf.sigPeriod)) : null;
      for (var i = 0; i < certs.length; i++) {
        var cert = certs[i];
        var exists = false;
        if (current) {
          // Already exists a link not replayable yet?
          exists = yield dal.existsLinkFromOrAfterDate(cert.from, cert.to, current.medianTime - conf.sigValidity);
        }
        if (!exists) {
          // Already exists a link not chainable yet?
          // No chainability block means absolutely nobody can issue certifications yet
          exists = current && (!blockOfChainability || (yield dal.existsNonChainableLink(cert.from, blockOfChainability.number, conf.sigStock)));
          if (!exists) {
            // It does NOT already exists a similar certification written, which is not replayable yet
            // Signatory must be a member
            var isSignatoryAMember = yield dal.isMember(cert.from);
            var isCertifiedANonLeavingMember = isSignatoryAMember && (yield dal.isMemberAndNonLeaver(cert.to));
            // Certified must be a member and non-leaver
            if (isSignatoryAMember && isCertifiedANonLeavingMember) {
              updatesToFrom[cert.to] = updatesToFrom[cert.to] || [];
              updates[cert.to] = updates[cert.to] || [];
              if (updatesToFrom[cert.to].indexOf(cert.from) == -1) {
                updates[cert.to].push(cert);
                updatesToFrom[cert.to].push(cert.from);
              }
            }
          }
        }
      }
      return updates;
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
          if (exists && !preJoinData[pubkey].identity.wasMember) {
            return next('UID already taken');
          }
          validator.checkExistsPubkey(pubkey, next);
        },
        function(exists, next) {
          if (exists && !preJoinData[pubkey].identity.wasMember) {
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
