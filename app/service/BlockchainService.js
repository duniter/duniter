"use strict";

const async           = require('async');
const _               = require('underscore');
const co              = require('co');
const Q               = require('q');
const parsers         = require('../lib/streams/parsers');
const rules           = require('../lib/rules');
const base58          = require('../lib/crypto/base58');
const keyring         = require('../lib/crypto/keyring');
const constants       = require('../lib/constants');
const blockchainCtx   = require('../lib/computation/blockchainContext');
const blockGenerator  = require('../lib/computation/blockGenerator');
const blockProver     = require('../lib/computation/blockProver');
const Block           = require('../lib/entity/block');
const Identity        = require('../lib/entity/identity');
const Transaction     = require('../lib/entity/transaction');
const AbstractService = require('./AbstractService');

const CHECK_ALL_RULES = true;

module.exports = (server) => {
  return new BlockchainService(server);
};

function BlockchainService (server) {

  AbstractService.call(this);

  let that = this;
  const mainContext = blockchainCtx();
  const prover = this.prover = blockProver(server);
  const generator = blockGenerator(mainContext, prover);
  let conf, dal, keyPair, logger, selfPubkey;

  this.setConfDAL = (newConf, newDAL, newKeyPair) => {
    dal = newDAL;
    conf = newConf;
    keyPair = newKeyPair;
    mainContext.setConfDAL(conf, dal);
    prover.setConfDAL(conf, dal, newKeyPair);
    generator.setConfDAL(conf, dal, newKeyPair);
    selfPubkey = newKeyPair.publicKey;
    logger = require('../lib/logger')(dal.profile);
  };

  const statTests = {
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
  const statNames = ['newcomers', 'certs', 'joiners', 'actives', 'leavers', 'revoked', 'excluded', 'ud', 'tx'];

  this.current = () => dal.getCurrentBlockOrNull();

  this.promoted = (number) => co(function *() {
    const bb = yield dal.getPromoted(number);
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
    const forkables = [];
    for (const block of forkBlocks) {
      const refered = yield dal.getBlockByNumberAndHashOrNull(block.number - 1, block.previousHash);
      if (refered) {
        forkables.push(block);
      }
    }
    const branches = getBranches(forkables, _.difference(forkBlocks, forkables));
    const current = yield mainContext.current();
    const forks = branches.map((branch) => branch[branch.length - 1]);
    return forks.concat([current]);
  });

  function getBranches(forkables, others) {
    // All starting branches
    let branches = forkables.map((fork) => [fork]);
    // For each "pending" block, we try to add it to all branches
    for (const other of others) {
      for (let j = 0, len2 = branches.length; j < len2; j++) {
        const branch = branches[j];
        const last = branch[branch.length - 1];
        if (other.number == last.number + 1 && other.previousHash == last.hash) {
          branch.push(other);
        } else if (branch[1]) {
          // We try to find out if another fork block can be forked
          const diff = other.number - branch[0].number;
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
      const maxSize = branches[0].length;
      const longestsBranches = [];
      for (const branch of branches) {
        if (branch.length == maxSize) {
          longestsBranches.push(branch);
        }
      }
      return longestsBranches;
    }
    return [];
  }

  this.submitBlock = (obj, doCheck, forkAllowed) => this.pushFIFO(() => checkAndAddBlock(obj, doCheck, forkAllowed));

  const checkAndAddBlock = (blockToAdd, doCheck, forkAllowed) => co(function *() {
    // Check global format, notably version number
    const obj = parsers.parseBlock.syncWrite(Block.statics.fromJSON(blockToAdd).getRawSigned());
    // Force usage of local currency name, do not accept other currencies documents
    if (conf.currency) {
      obj.currency = conf.currency || obj.currency;
    } else {
      conf.currency = obj.currency;
    }
    try {
      Transaction.statics.setIssuers(obj.transactions);
    }
    catch (e) {
        throw e;
    }
    let existing = yield dal.getBlockByNumberAndHashOrNull(obj.number, obj.hash);
    if (existing) {
      throw constants.ERRORS.BLOCK_ALREADY_PROCESSED;
    }
    let current = yield mainContext.current();
    let followsCurrent = !current || (obj.number == current.number + 1 && obj.previousHash == current.hash);
    if (followsCurrent) {
      // try to add it on main blockchain
      if (doCheck) {
        yield mainContext.checkBlock(obj, constants.WITH_SIGNATURES_AND_POW);
      }
      let res = yield mainContext.addBlock(obj);
      try {
        yield pushStatsForBlocks([res]);
        server.permaProver.blockchainChanged(res);
      } catch (e) {
        logger.warn("An error occurred after the add of the block", e.stack || e);
      }
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


  that.tryToFork = (current) => co(function *() {
    yield eventuallySwitchOnSideChain(current);
    let newCurrent = yield mainContext.current();
    let forked = newCurrent.number != current.number || newCurrent.hash != current.hash;
    if (forked) {
      server.permaProver.blockchainChanged();
    }
  });

  const eventuallySwitchOnSideChain = (current) => co(function *() {
    const branches = yield that.branches();
    const blocksAdvance = constants.BRANCHES.SWITCH_ON_BRANCH_AHEAD_BY_X_MINUTES / (conf.avgGenTime / 60);
    const timeAdvance = constants.BRANCHES.SWITCH_ON_BRANCH_AHEAD_BY_X_MINUTES * 60;
    let potentials = _.without(branches, current);
    // We switch only to blockchain with X_MIN advance considering both theoretical time by block + written time
    potentials = _.filter(potentials, (p) => p.number - current.number >= blocksAdvance
                                  && p.medianTime - current.medianTime >= timeAdvance);
    logger.trace('SWITCH: %s branches...', branches.length);
    logger.trace('SWITCH: %s potential side chains...', potentials.length);
    for (const potential of potentials) {
      logger.info('SWITCH: get side chain #%s-%s...', potential.number, potential.hash);
      const sideChain = yield getWholeForkBranch(potential);
      logger.info('SWITCH: revert main chain to block #%s...', sideChain[0].number - 1);
      yield revertToBlock(sideChain[0].number - 1);
      try {
        logger.info('SWITCH: apply side chain #%s-%s...', potential.number, potential.hash);
        yield applySideChain(sideChain);
      } catch (e) {
        logger.warn('SWITCH: error %s', e.stack || e);
        // Revert the revert (so we go back to original chain)
        const revertedChain = yield getWholeForkBranch(current);
        yield revertToBlock(revertedChain[0].number - 1);
        yield applySideChain(revertedChain);
        yield markSideChainAsWrong(sideChain);
      }
    }
  });

  const getWholeForkBranch = (topForkBlock) => co(function *() {
    const fullBranch = [];
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

  const revertToBlock = (number) => co(function *() {
    let nowCurrent = yield that.current();
    logger.trace('SWITCH: main chain current = #%s-%s...', nowCurrent.number, nowCurrent.hash);
    while (nowCurrent.number > number) {
      logger.trace('SWITCH: main chain revert #%s-%s...', nowCurrent.number, nowCurrent.hash);
      yield mainContext.revertCurrentBlock();
      nowCurrent = yield that.current();
    }
  });

  const applySideChain = (chain) => co(function *() {
    for (const block of chain) {
      logger.trace('SWITCH: apply side block #%s-%s -> #%s-%s...', block.number, block.hash, block.number - 1, block.previousHash);
      yield checkAndAddBlock(block, CHECK_ALL_RULES);
    }
  });

  const markSideChainAsWrong = (chain) => co(function *() {
    for (const block of chain) {
      block.wrong = true;
      // Saves the block (DAL)
      yield dal.saveSideBlockInFile(block);
    }
  });

  this.revertCurrentBlock = () => this.pushFIFO(() => mainContext.revertCurrentBlock());

  this.applyNextAvailableFork = () => this.pushFIFO(() => mainContext.applyNextAvailableFork());

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
    let current = yield dal.getCurrentBlockOrNull();
    for (const obj of identities) {
      let idty = new Identity(obj);
      try {
        let reqs = yield that.requirementsOfIdentity(idty, current);
        all.push(reqs);
      } catch (e) {
        logger.warn(e);
      }
    }
    return all;
  });

  this.requirementsOfIdentity = (idty, current) => co(function *() {
    // TODO: this is not clear
    let expired = false;
    let outdistanced = false;
    let expiresMS = 0;
    let expiresPending = 0;
    let certs = [];
    try {
      const join = yield generator.getSinglePreJoinData(current, idty.hash);
      const pubkey = join.identity.pubkey;
      // Check WoT stability
      const someNewcomers = join.identity.wasMember ? [] : [join.identity.pubkey];
      const nextBlockNumber = current ? current.number + 1 : 0;
      const joinData = {};
      joinData[join.identity.pubkey] = join;
      const updates = {};
      const newCerts = yield generator.computeNewCerts(nextBlockNumber, [join.identity.pubkey], joinData, updates);
      const newLinks = generator.newCertsToLinks(newCerts, updates);
      const currentTime = current ? current.medianTime : 0;
      const currentVersion = current ? current.version : constants.BLOCK_GENERATED_VERSION;
      certs = yield that.getValidCerts(pubkey, newCerts);
      outdistanced = yield rules.HELPERS.isOver3Hops(currentVersion, pubkey, newLinks, someNewcomers, current, conf, dal);
      // Expiration of current membershship
      if (join.identity.currentMSN >= 0) {
        if (join.identity.member) {
          const msBlock = yield dal.getBlock(join.identity.currentMSN);
          if (msBlock && msBlock.medianTime) { // special case for block #0
            expiresMS = Math.max(0, (msBlock.medianTime + conf.msValidity - currentTime));
          }
          else {
            expiresMS = conf.msValidity;
          }
        } else {
          expiresMS = 0;
        }
      }
      // Expiration of pending membership
      const lastJoin = yield dal.lastJoinOfIdentity(idty.hash);
      if (lastJoin) {
        const msBlock = yield dal.getBlock(lastJoin.blockNumber);
        if (msBlock && msBlock.medianTime) { // Special case for block#0
          expiresPending = Math.max(0, (msBlock.medianTime + conf.msValidity - currentTime));
        }
        else {
          expiresPending = conf.msValidity;
        }
      }
      // Expiration of certifications
      for (const cert of certs) {
        cert.expiresIn = Math.max(0, cert.timestamp + conf.sigValidity - currentTime);
      }
    } catch (e) {
      // We throw whatever isn't "Too old identity" error
      if (!(e && e.uerr && e.uerr.ucode == constants.ERRORS.TOO_OLD_IDENTITY.uerr.ucode)) {
        throw e;
      } else {
        expired = true;
      }
    }
    return {
      pubkey: idty.pubkey,
      uid: idty.uid,
      meta: {
        timestamp: idty.buid
      },
      expired: expired,
      outdistanced: outdistanced,
      certifications: certs,
      membershipPendingExpiresIn: expiresPending,
      membershipExpiresIn: expiresMS
    };
  });

  this.getValidCerts = (newcomer, newCerts) => co(function *() {
    const links = yield dal.getValidLinksTo(newcomer);
    const certsFromLinks = links.map((lnk) => { return { from: lnk.source, to: lnk.target, timestamp: lnk.timestamp }; });
    const certsFromCerts = [];
    const certs = newCerts[newcomer] || [];
    for (const cert of certs) {
      const block = yield dal.getBlock(cert.block_number);
      certsFromCerts.push({
        from: cert.from,
        to: cert.to,
        timestamp: block.medianTime
      });
    }
    return certsFromLinks.concat(certsFromCerts);
  });

  this.prove = prover.prove;

  this.isMember = () => dal.isMember(selfPubkey);
  this.getCountOfSelfMadePoW = () => dal.getCountOfPoW(selfPubkey);

  this.makeNextBlock = generator.makeNextBlock;

  this.saveParametersForRootBlock = (block) => co(function *() {
    let mainFork = mainContext;
    let rootBlock = block || (yield dal.getBlock(0));
    if (!rootBlock) throw 'Cannot registrer currency parameters since no root block exists';
    return mainFork.saveParametersForRootBlock(rootBlock);
  });

  this.saveBlocksInMainBranch = (blocks) => co(function *() {
    // VERY FIRST: parameters, otherwise we compute wrong variables such as UDTime
    if (blocks[0].number == 0) {
      yield that.saveParametersForRootBlock(blocks[0]);
    }
    // Helper to retrieve a block with local cache
    const getBlock = (number) => {
      const firstLocalNumber = blocks[0].number;
      if (number >= firstLocalNumber) {
        let offset = number - firstLocalNumber;
        return Q(blocks[offset]);
      }
      return dal.getBlock(number);
    };
    const getBlockByNumberAndHash = (number, hash) => co(function*() {
      const block = yield getBlock(number);
      if (!block || block.hash != hash) {
        throw 'Block #' + [number, hash].join('-') + ' not found neither in DB nor in applying blocks';
      }
      return block;
    });
    // Insert a bunch of blocks
    const lastPrevious = blocks[0].number == 0 ? null : yield dal.getBlock(blocks[0].number - 1);
    const dividends = [];
    for (let i = 0; i < blocks.length; i++) {
      const previous = i > 0 ? blocks[i - 1] : lastPrevious;
      const block = blocks[i];
      block.len = Block.statics.getLen(block);
      block.fork = false;
      // Monetary mass & UD Time recording before inserting elements
      block.monetaryMass = (previous && previous.monetaryMass) || 0;
      block.unitbase = (block.dividend && block.unitbase) || (previous && previous.unitbase) || 0;
      block.dividend = block.dividend || null;
      // UD Time update
      const previousBlock = i > 0 ? blocks[i - 1] : lastPrevious;
      if (block.number == 0) {
        block.UDTime = block.medianTime; // Root = first UD time
      }
      else if (block.dividend) {
        block.UDTime = conf.dt + previousBlock.UDTime;
        block.monetaryMass += block.dividend * Math.pow(10, block.unitbase || 0) * block.membersCount;
      } else {
        block.UDTime = previousBlock.UDTime;
      }
      yield mainContext.updateMembers(block);

      // Dividends
      if (block.dividend) {
        // Get the members at THAT moment (only them should have the UD)
        let idties = yield dal.getMembers();
        for (const idty of idties) {
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
    yield mainContext.updateTransactionsForBlocks(blocks, getBlockByNumberAndHash);
    // Create certifications
    yield mainContext.updateMembershipsForBlocks(blocks);
    // Create certifications
    yield mainContext.updateLinksForBlocks(blocks, getBlock);
    // Create certifications
    yield mainContext.updateCertificationsForBlocks(blocks);
    // Create / Update sources
    yield mainContext.updateTransactionSourcesForBlocks(blocks, dividends);
    logger.debug(blocks[0].number);
    yield dal.blockDAL.saveBunch(blocks);
    yield pushStatsForBlocks(blocks);
  });

  function pushStatsForBlocks(blocks) {
    const stats = {};
    // Stats
    for (const block of blocks) {
      for (const statName of statNames) {
        if (!stats[statName]) {
          stats[statName] = { blocks: [] };
        }
        const stat = stats[statName];
        const testProperty = statTests[statName];
        const value = block[testProperty];
        const isPositiveValue = value && typeof value != 'object';
        const isNonEmptyArray = value && typeof value == 'object' && value.length > 0;
        if (isPositiveValue || isNonEmptyArray) {
          stat.blocks.push(block.number);
        }
        stat.lastParsedBlock = block.number;
      }
    }
    return dal.pushStats(stats);
  }

  this.getCertificationsExludingBlock = () => co(function*() {
    try {
      const current = yield dal.getCurrentBlockOrNull();
      return yield dal.getCertificationExcludingBlock(current, conf.sigValidity);
    } catch (err) {
        return { number: -1 };
    }
  });

  this.blocksBetween = (from, count) => co(function *() {
    if (count > 5000) {
      throw 'Count is too high';
    }
    const current = yield that.current();
    count = Math.min(current.number - from + 1, count);
    if (!current || current.number < from) {
      return [];
    }
    return dal.getBlocksBetween(from, from + count - 1);
  });

  const cleanMemFifo = async.queue((task, callback) => task(callback), 1);
  let cleanMemFifoInterval = null;
  this.regularCleanMemory = function (done) {
    if (cleanMemFifoInterval)
      clearInterval(cleanMemFifoInterval);
    cleanMemFifoInterval = setInterval(() => cleanMemFifo.push(cleanMemory), 1000 * constants.MEMORY_CLEAN_INTERVAL);
    cleanMemory(done);
  };

  this.stopCleanMemory = () => clearInterval(cleanMemFifoInterval);

  const cleanMemory = (done) => {
    dal.blockDAL.migrateOldBlocks()
      .then(() => done())
      .catch((err) => {
        logger.warn(err);
        done();
      });
  };

  this.changeProverCPUSetting = (cpu) => prover.changeCPU(cpu);
}
