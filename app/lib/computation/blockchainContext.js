"use strict";
const _               = require('underscore');
const co              = require('co');
const indexer         = require('../indexer');
const constants       = require('../constants');
const Block           = require('../entity/block');
const Transaction     = require('../entity/transaction');
const SQLBlockchain = require('../blockchain/sqlBlockchain')
const DuniterBlockchain = require('../blockchain/duniterBlockchain')

module.exports = (BlockchainService) => { return new BlockchainContext(BlockchainService) };

function BlockchainContext(BlockchainService) {

  const that = this;
  let conf, dal, logger, blockchain;

  /**
   * The virtual next HEAD. Computed each time a new block is added, because a lot of HEAD variables are deterministic
   * and can be computed one, just after a block is added for later controls.
   */
  let vHEAD;

  /**
   * The currently written HEAD, aka. HEAD_1 relatively to incoming HEAD.
   */
  let vHEAD_1;

  let HEADrefreshed = Promise.resolve();

  /**
   * Refresh the virtual HEAD value for determined variables of the next coming block, avoiding to recompute them
   * each time a new block arrives to check if the values are correct. We can know and store them early on, in vHEAD.
   */
  function refreshHead() {
    HEADrefreshed = co(function*() {
      vHEAD_1 = yield dal.head(1);
      // We suppose next block will have same version #, and no particular data in the block (empty index)
      let block;
      // But if no HEAD_1 exist, we must initialize a block with default values
      if (!vHEAD_1) {
        block = {
          version: constants.BLOCK_GENERATED_VERSION,
          time: Math.round(Date.now() / 1000),
          powMin: conf.powMin || 0,
          powZeros: 0,
          powRemainder: 0,
          avgBlockSize: 0
        };
      } else {
        block = { version: vHEAD_1.version };
      }
      vHEAD = yield indexer.completeGlobalScope(Block.statics.fromJSON(block), conf, [], dal);
    });
    return HEADrefreshed;
  }

  /**
   * Gets a copy of vHEAD, extended with some extra properties.
   * @param props The extra properties to add.
   */
  this.getvHeadCopy = (props) => co(function*() {
    if (!vHEAD) {
      yield refreshHead();
    }
    const copy = {};
    const keys = Object.keys(vHEAD);
    for (const k of keys) {
      copy[k] = vHEAD[k];
    }
    _.extend(copy, props);
    return copy;
  });

  /**
   * Get currently written HEAD.
   */
  this.getvHEAD_1 = () => co(function*() {
    if (!vHEAD) {
      yield refreshHead();
    }
    return vHEAD_1;
  });

  /**
   * Utility method: gives the personalized difficulty level of a given issuer for next block.
   * @param issuer The issuer we want to get the difficulty level.
   */
  this.getIssuerPersonalizedDifficulty = (issuer) => co(function *() {
    const local_vHEAD = yield that.getvHeadCopy({ issuer });
    yield indexer.preparePersonalizedPoW(local_vHEAD, vHEAD_1, dal.range, conf);
    return local_vHEAD.issuerDiff;
  });

  this.setConfDAL = (newConf, newDAL) => {
    dal = newDAL;
    conf = newConf;
    logger = require('../logger')(dal.profile);
    blockchain = new DuniterBlockchain(new SQLBlockchain(dal), dal)
  };

  this.checkBlock = (block, withPoWAndSignature) => blockchain.checkBlock(block, withPoWAndSignature, conf, dal)

  this.addBlock = (obj) => co(function*() {
    const block = yield blockchain.pushBlock(obj, null, conf, dal, logger)
    vHEAD_1 = vHEAD = HEADrefreshed = null;
    return block
  })

  this.addSideBlock = (obj) => blockchain.pushSideBlock(obj, dal, logger)

  this.revertCurrentBlock = () => co(function *() {
    const head_1 = yield dal.bindexDAL.head(1);
    logger.debug('Reverting block #%s...', head_1.number);
    const res = yield blockchain.revertBlock(head_1.number, head_1.hash, dal)
    logger.debug('Reverted block #%s', head_1.number);
    // Invalidates the head, since it has changed.
    yield refreshHead();
    return res;
  });

  this.applyNextAvailableFork = () => co(function *() {
    const current = yield that.current();
    logger.debug('Find next potential block #%s...', current.number + 1);
    const forks = yield dal.getForkBlocksFollowing(current);
    if (!forks.length) {
      throw constants.ERRORS.NO_POTENTIAL_FORK_AS_NEXT;
    }
    const block = forks[0];
    yield that.checkBlock(block, constants.WITH_SIGNATURES_AND_POW);
    yield that.addBlock(block);
    logger.debug('Applied block #%s', block.number);
  });

  this.current = () => dal.getCurrentBlockOrNull();

  this.createNewcomers = (iindex) => blockchain.createNewcomers(iindex, dal, logger)

  this.updateMembers = (block) => blockchain.updateMembers(block, dal);

  this.updateWallets = (sindex, aDal, reverse) => blockchain.updateWallets(sindex, aDal, reverse)

  this.saveParametersForRootBlock = (block) => blockchain.saveParametersForRoot(block, conf, dal);

  this.checkHaveEnoughLinks = (target, newLinks) => co(function*() {
    const links = yield dal.getValidLinksTo(target);
    let count = links.length;
    if (newLinks[target] && newLinks[target].length)
      count += newLinks[target].length;
    if (count < conf.sigQty)
      throw 'Key ' + target + ' does not have enough links (' + count + '/' + conf.sigQty + ')';
  });

  /**
   * New method for CREATING transactions found in blocks.
   * Made for performance reasons, this method will batch insert all transactions at once.
   * @param blocks
   * @param getBlockByNumberAndHash
   * @returns {*}
   */
  this.updateTransactionsForBlocks = (blocks, getBlockByNumberAndHash) => co(function *() {
    let txs = [];
    for (const block of blocks) {
      const newOnes = [];
      for (const tx of block.transactions) {
        _.extend(tx, {
          block_number: block.number,
          time: block.medianTime,
          currency: block.currency,
          written: true,
          removed: false
        });
        const sp = tx.blockstamp.split('-');
        tx.blockstampTime = (yield getBlockByNumberAndHash(sp[0], sp[1])).medianTime;
        const txEntity = new Transaction(tx);
        txEntity.computeAllHashes();
        newOnes.push(txEntity);
      }
      txs = txs.concat(newOnes);
    }
    return dal.updateTransactions(txs);
  });

  let sync_bindex = [];
  let sync_iindex = [];
  let sync_mindex = [];
  let sync_cindex = [];
  let sync_sindex = [];
  let sync_bindexSize = 0;
  let sync_allBlocks = [];
  let sync_expires = [];
  let sync_nextExpiring = 0;
  let sync_currConf = {};
  const sync_memoryWallets = {}
  const sync_memoryDAL = {
    getWallet: (conditions) => Promise.resolve(sync_memoryWallets[conditions] || { conditions, balance: 0 }),
    saveWallet: (wallet) => co(function*() {
      // Make a copy
      sync_memoryWallets[wallet.conditions] = {
        conditions: wallet.conditions,
        balance: wallet.balance
      }
    })
  }

  this.quickApplyBlocks = (blocks, to) => co(function*() {

    sync_memoryDAL.sindexDAL = { getAvailableForConditions: dal.sindexDAL.getAvailableForConditions }
    const ctx = that
    let blocksToSave = [];

    for (const block of blocks) {
      sync_allBlocks.push(block);

      if (block.number == 0) {
        sync_currConf = Block.statics.getConf(block);
      }

      if (block.number != to) {
        blocksToSave.push(block);
        const index = indexer.localIndex(block, sync_currConf);
        const local_iindex = indexer.iindex(index);
        const local_cindex = indexer.cindex(index);
        const local_sindex = indexer.sindex(index);
        const local_mindex = indexer.mindex(index);
        sync_iindex = sync_iindex.concat(local_iindex);
        sync_cindex = sync_cindex.concat(local_cindex);
        sync_mindex = sync_mindex.concat(local_mindex);

        const HEAD = yield indexer.quickCompleteGlobalScope(block, sync_currConf, sync_bindex, sync_iindex, sync_mindex, sync_cindex, {
          getBlock: (number) => {
            return Promise.resolve(sync_allBlocks[number]);
          },
          getBlockByBlockstamp: (blockstamp) => {
            return Promise.resolve(sync_allBlocks[parseInt(blockstamp)]);
          }
        });
        sync_bindex.push(HEAD);

        // Remember expiration dates
        for (const entry of index) {
          if (entry.op === 'CREATE' && (entry.expires_on || entry.revokes_on)) {
            sync_expires.push(entry.expires_on || entry.revokes_on);
          }
        }
        sync_expires = _.uniq(sync_expires);

        yield ctx.createNewcomers(local_iindex);

        if (block.dividend
          || block.joiners.length
          || block.actives.length
          || block.revoked.length
          || block.excluded.length
          || block.certifications.length
          || block.transactions.length
          || block.medianTime >= sync_nextExpiring) {
          // logger.warn('>> Block#%s', block.number)

          for (let i = 0; i < sync_expires.length; i++) {
            let expire = sync_expires[i];
            if (block.medianTime > expire) {
              sync_expires.splice(i, 1);
              i--;
            }
          }
          let currentNextExpiring = sync_nextExpiring
          sync_nextExpiring = sync_expires.reduce((max, value) => max ? Math.min(max, value) : value, sync_nextExpiring);
          const nextExpiringChanged = currentNextExpiring !== sync_nextExpiring

          // Fills in correctly the SINDEX
          yield _.where(sync_sindex.concat(local_sindex), { op: 'UPDATE' }).map((entry) => co(function*() {
            if (!entry.conditions) {
              const src = yield dal.sindexDAL.getSource(entry.identifier, entry.pos);
              entry.conditions = src.conditions;
            }
          }))

          // Flush the INDEX (not bindex, which is particular)
          yield dal.mindexDAL.insertBatch(sync_mindex);
          yield dal.iindexDAL.insertBatch(sync_iindex);
          yield dal.sindexDAL.insertBatch(sync_sindex);
          yield dal.cindexDAL.insertBatch(sync_cindex);
          sync_mindex = [];
          sync_iindex = [];
          sync_cindex = [];
          sync_sindex = local_sindex;

          sync_sindex = sync_sindex.concat(yield indexer.ruleIndexGenDividend(HEAD, dal));
          sync_sindex = sync_sindex.concat(yield indexer.ruleIndexGarbageSmallAccounts(HEAD, sync_sindex, sync_memoryDAL));
          if (nextExpiringChanged) {
            sync_cindex = sync_cindex.concat(yield indexer.ruleIndexGenCertificationExpiry(HEAD, dal));
            sync_mindex = sync_mindex.concat(yield indexer.ruleIndexGenMembershipExpiry(HEAD, dal));
            sync_iindex = sync_iindex.concat(yield indexer.ruleIndexGenExclusionByMembership(HEAD, sync_mindex, dal));
            sync_iindex = sync_iindex.concat(yield indexer.ruleIndexGenExclusionByCertificatons(HEAD, sync_cindex, local_iindex, conf, dal));
            sync_mindex = sync_mindex.concat(yield indexer.ruleIndexGenImplicitRevocation(HEAD, dal));
          }
          // Update balances with UD + local garbagings
          yield that.updateWallets(sync_sindex, sync_memoryDAL)

          // --> Update links
          yield dal.updateWotbLinks(local_cindex.concat(sync_cindex));

          // Flush the INDEX again
          yield dal.mindexDAL.insertBatch(sync_mindex);
          yield dal.iindexDAL.insertBatch(sync_iindex);
          yield dal.sindexDAL.insertBatch(sync_sindex);
          yield dal.cindexDAL.insertBatch(sync_cindex);
          sync_mindex = [];
          sync_iindex = [];
          sync_cindex = [];
          sync_sindex = [];

          // Create/Update nodes in wotb
          yield ctx.updateMembers(block);
        }

        // Trim the bindex
        sync_bindexSize = [
          block.issuersCount,
          block.issuersFrame,
          conf.medianTimeBlocks,
          conf.dtDiffEval,
          blocks.length
        ].reduce((max, value) => {
          return Math.max(max, value);
        }, 0);

        if (sync_bindexSize && sync_bindex.length >= 2 * sync_bindexSize) {
          // We trim it, not necessary to store it all (we already store the full blocks)
          sync_bindex.splice(0, sync_bindexSize);

          // Process triming continuously to avoid super long ending of sync
          yield dal.trimIndexes(sync_bindex[0].number);
        }
      } else {

        if (blocksToSave.length) {
          yield BlockchainService.saveBlocksInMainBranch(blocksToSave);
        }
        blocksToSave = [];

        // Save the INDEX
        yield dal.bindexDAL.insertBatch(sync_bindex);
        yield dal.mindexDAL.insertBatch(sync_mindex);
        yield dal.iindexDAL.insertBatch(sync_iindex);
        yield dal.sindexDAL.insertBatch(sync_sindex);
        yield dal.cindexDAL.insertBatch(sync_cindex);

        // Save the intermediary table of wallets
        const conditions = _.keys(sync_memoryWallets)
        const nonEmptyKeys = _.filter(conditions, (k) => sync_memoryWallets[k] && sync_memoryWallets[k].balance > 0)
        const walletsToRecord = nonEmptyKeys.map((k) => sync_memoryWallets[k])
        yield dal.walletDAL.insertBatch(walletsToRecord)

        // Last block: cautious mode to trigger all the INDEX expiry mechanisms
        yield BlockchainService.submitBlock(block, true, true);

        // Clean temporary variables
        sync_bindex = [];
        sync_iindex = [];
        sync_mindex = [];
        sync_cindex = [];
        sync_sindex = [];
        sync_bindexSize = 0;
        sync_allBlocks = [];
        sync_expires = [];
        sync_nextExpiring = 0;
        sync_currConf = {};
      }
    }
    if (blocksToSave.length) {
      yield BlockchainService.saveBlocksInMainBranch(blocksToSave);
    }
  })
}
