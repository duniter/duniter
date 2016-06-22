"use strict";

var async           = require('async');
var _               = require('underscore');
var co              = require('co');
var Q               = require('q');
var rules           = require('../lib/rules');
var base58          = require('../lib/base58');
var signature       = require('../lib/signature');
var constants       = require('../lib/constants');
var blockchainCtx   = require('../lib/blockchainContext');
var blockGenerator  = require('../lib/blockGenerator');
var blockProver     = require('../lib/blockProver');
let Identity        = require('../lib/entity/identity');
var Transaction     = require('../lib/entity/transaction');
var AbstractService = require('./AbstractService');

const CHECK_ALL_RULES = true;

module.exports = function() {
  return new BlockchainService();
};

function BlockchainService () {

  AbstractService.call(this);

  let that = this;
  let mainContext = blockchainCtx();
  let prover = blockProver();
  let generator = blockGenerator(mainContext, prover);
  let conf, dal, pair, logger, selfPubkey;

  this.setConfDAL = (newConf, newDAL, newPair) => {
    dal = newDAL;
    conf = newConf;
    pair = newPair;
    mainContext.setConfDAL(conf, dal);
    prover.setConfDAL(conf, dal, pair);
    generator.setConfDAL(conf, dal, pair);
    selfPubkey = base58.encode(pair.publicKey);
    logger = require('../lib/logger')(dal.profile);
  };

  let lastGeneratedWasWrong = false;

  let statTests = {
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

  this.current = (done) =>
    dal.getCurrentBlockOrNull(done);

  this.promoted = (number) => co(function *() {
    let bb = yield dal.getPromoted(number);
    if (!bb) throw constants.ERRORS.BLOCK_NOT_FOUND;
    return bb;
  });

  this.checkBlock = function(block) {
    return mainContext.checkBlock(block);
  };

  this.branches = () => co(function *() {
    let forkBlocks = yield dal.blockDAL.getForkBlocks();
    forkBlocks = _.sortBy(forkBlocks, 'number');
    // Get the blocks refering current blockchain
    let forkables = [];
    for (let i = 0; i < forkBlocks.length; i++) {
      let block = forkBlocks[i];
      let refered = yield dal.getBlockByNumberAndHashOrNull(block.number - 1, block.previousHash);
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

  this.submitBlock = (obj, doCheck, forkAllowed) => this.pushFIFO(() => checkAndAddBlock(obj, doCheck, forkAllowed));

  function checkAndAddBlock(obj, doCheck, forkAllowed) {
    return co(function *() {
      Transaction.statics.setIssuers(obj.transactions);
      let existing = yield dal.getBlockByNumberAndHashOrNull(obj.number, obj.hash);
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
        that.stopPoWThenProcessAndRestartPoW();
        return res;
      } else if (forkAllowed) {
        // add it as side chain
        if (current.number - obj.number + 1 >= conf.forksize) {
          throw 'Block out of fork window';
        }
        let absolute = yield dal.getAbsoluteBlockByNumberAndHash(obj.number, obj.hash);
        let res = null;
        if (!absolute) {
          res = yield mainContext.addSideBlock(obj, doCheck);
        }
        yield that.tryToFork(current);
        return res;
      } else {
        throw "Fork block rejected";
      }
    });
  }

  that.tryToFork = (current) => co(function *() {
    yield eventuallySwitchOnSideChain(current);
    let newCurrent = yield mainContext.current();
    let forked = newCurrent.number != current.number || newCurrent.hash != current.hash;
    if (forked) {
      that.stopPoWThenProcessAndRestartPoW();
    }
  });

  function eventuallySwitchOnSideChain(current) {
    return co(function *() {
      let branches = yield that.branches();
      let potentials = _.without(branches, current);
      let blocksAdvance = constants.BRANCHES.SWITCH_ON_BRANCH_AHEAD_BY_X_MINUTES / (conf.avgGenTime / 60);
      let timeAdvance = constants.BRANCHES.SWITCH_ON_BRANCH_AHEAD_BY_X_MINUTES * 60;
      // We switch only to blockchain with X_MIN advance considering both theoretical time by block + written time
      potentials = _.filter(potentials, (p) => p.number - current.number >= blocksAdvance && p.medianTime - current.medianTime >= timeAdvance);
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
        next = yield dal.getAbsoluteBlockByNumberAndHash(next.number - 1, next.previousHash);
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
        yield dal.saveSideBlockInFile(block);
      }
    });
  }

  this.revertCurrentBlock = () => this.pushFIFO(() => mainContext.revertCurrentBlock());

  this.stopPoWThenProcessAndRestartPoW = function () {
    prover.cancel();
  };

  /**
   * Generates root block with manual selection of root members.
   */
  this.generateManualRoot = () => generator.manualRoot();

  /**
   * Generates next block, finding newcomers, renewers, leavers, certs, transactions, etc.
   */
  this.generateNext = () => generator.nextBlock();

  this.requirementsOfIdentities = (identities) => co(function *() {
    let all = [];
    let current = yield dal.getCurrent();
    for (let i = 0, len = identities.length; i < len; i++) {
      let idty = new Identity(identities[i]);
      let reqs = yield that.requirementsOfIdentity(idty, current);
      all.push(reqs);
    }
    return all;
  });

  this.requirementsOfIdentity = (idty, current) => co(function *() {
    // TODO: this is not clear
    let join = yield Q.nfcall(generator.getSinglePreJoinData, current, idty.hash);
    let pubkey = join.identity.pubkey;
    // Check WoT stability
    let someNewcomers = join.identity.wasMember ? [] : [join.identity.pubkey];
    let nextBlockNumber = current ? current.number + 1 : 0;
    let joinData = {};
    joinData[join.identity.pubkey] = join;
    let updates = {};
    let newCerts = yield generator.computeNewCerts(nextBlockNumber, [join.identity.pubkey], joinData, updates);
    let newLinks = generator.newCertsToLinks(newCerts, updates);
    let certs = yield that.getValidCerts(pubkey, newCerts);
    let outdistanced = yield rules.HELPERS.isOver3Hops(pubkey, newLinks, someNewcomers, current, conf, dal);
    let expiresMS = 0;
    let currentTime = current ? current.medianTime : 0;
    // Expiration of current membershship
    if (join.identity.currentMSN >= 0) {
      let msBlock = yield dal.getBlockOrNull(join.identity.currentMSN);
      expiresMS = Math.max(0, (msBlock.medianTime + conf.msValidity - currentTime));
    }
    // Expiration of pending membership
    let expiresPending = 0;
    let lastJoin = yield dal.lastJoinOfIdentity(idty.hash);
    if (lastJoin) {
      let msBlock = yield dal.getBlockOrNull(lastJoin.blockNumber);
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
    let links = yield dal.getValidLinksTo(newcomer);
    let certsFromLinks = links.map((lnk) => { return { from: lnk.source, to: lnk.target, timestamp: lnk.timestamp }; });
    let certsFromCerts = [];
    let certs = newCerts[newcomer] || [];
    for (let i = 0, len = certs.length; i < len; i++) {
      let cert = certs[i];
      let block = yield dal.getBlockOrNull(cert.block_number);
      certsFromCerts.push({
        from: cert.from,
        to: cert.to,
        timestamp: block.medianTime
      });
    }
    return certsFromLinks.concat(certsFromCerts);
  });

  this.prove = prover.prove;

  this.startGeneration = () => co(function *() {
    if (!conf.participate) {
      throw 'This node is configured for not participating to computing blocks.';
    }
    if (!selfPubkey) {
      throw 'No self pubkey found.';
    }
    var block, current;
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
          try {
            yield prover.waitBeforePoW();
          } catch (e) {
            powCanceled = e;
          }
          if (powCanceled) {
            logger.warn(powCanceled);
            return null;
          }
        }
        var trial = yield rules.HELPERS.getTrialLevel(selfPubkey, conf, dal);
        if (trial > (current.powMin + 2)) {
          powCanceled = 'Too high difficulty: waiting for other members to write next block';
        }
        else {
          var block2 = lastGeneratedWasWrong ?
            yield generator.nextEmptyBlock() :
            yield generator.nextBlock();
          var signature2 = signature.sync(pair);
          var trial2 = yield rules.HELPERS.getTrialLevel(selfPubkey, conf, dal);
          prover.computing();
          return yield generator.makeNextBlock(block2, signature2, trial2);
        }
      }
    }
    if (powCanceled) {
      logger.warn(powCanceled);
      return prover.waitForContinue();
    }
  })
    .then(function(block){
      prover.notComputing();
      return block;
    });

  this.makeNextBlock = generator.makeNextBlock;

  this.saveParametersForRootBlock = (block) => co(function *() {
    let mainFork = mainContext;
    let rootBlock = block || (yield mainFork.dal.getBlockOrNull(0));
    if (!rootBlock) throw 'Cannot registrer currency parameters since no root block exists';
    return mainFork.saveParametersForRootBlock(rootBlock);
  });

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
      return dal.getBlockOrNull(number);
    };
    // Insert a bunch of blocks
    let lastPrevious = blocks[0].number == 0 ? null : yield dal.getBlock(blocks[0].number - 1);
    let dividends = [];
    for (let i = 0; i < blocks.length; i++) {
      let previous = i > 0 ? blocks[i - 1] : lastPrevious;
      let block = blocks[i];
      block.fork = false;
      // Monetary mass & UD Time recording before inserting elements
      block.monetaryMass = (previous && previous.monetaryMass) || 0;
      block.unitbase = (block.dividend && block.unitbase) || (previous && previous.unitbase) || 0;
      block.dividend = block.dividend || null;
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
      // Dividends
      if (block.dividend) {
        // Get the members at THAT moment (only them should have the UD)
        let idties = yield dal.getMembersP();
        for (let j = 0, len2 = idties.length; j < len2; j++) {
          let idty = idties[j];
          dividends.push({
            'pubkey': idty.pubkey,
            'identifier': idty.pubkey,
            'noffset': block.number,
            'type': 'D',
            'number': block.number,
            'time': block.medianTime,
            'fingerprint': block.hash,
            'block_hash': block.hash,
            'amount': block.dividend,
            'base': block.unitbase,
            'consumed': false,
            'toConsume': false,
            'conditions': 'SIG(' + idty.pubkey + ')' // Only this pubkey can unlock its UD
          });
        }
      }
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
    yield mainContext.updateTransactionSourcesForBlocks(blocks, dividends);
    yield dal.blockDAL.saveBunch(blocks);
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
    return dal.pushStats(stats);
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
    return dal.getCurrent()
      .then(function(current){
        return dal.getCertificationExcludingBlock(current, conf.sigValidity);
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
    return dal.getBlocksBetween(from, from + count - 1);
  });

  var cleanMemFifo = async.queue((task, callback) => task(callback), 1);
  var cleanMemFifoInterval = null;
  this.regularCleanMemory = function (done) {
    if (cleanMemFifoInterval)
      clearInterval(cleanMemFifoInterval);
    cleanMemFifoInterval = setInterval(() => cleanMemFifo.push(cleanMemory), 1000 * constants.MEMORY_CLEAN_INTERVAL);
    cleanMemory(done);
  };

  this.stopCleanMemory = () => clearInterval(cleanMemFifoInterval);

  function cleanMemory(done) {
    dal.blockDAL.migrateOldBlocks()
      .then(() => done())
      .catch((err) => {
        logger.warn(err);
        done();
      });
  }
}
