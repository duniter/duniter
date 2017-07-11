"use strict"

const Q = require('q');
const _ = require('underscore')
const co = require('co')
const indexer = require('../indexer')
const constants = require('../constants')
const Block = require('../entity/block')
const Transaction = require('../entity/transaction')
const DuniterBlockchain = require('../blockchain/duniterBlockchain')

module.exports = (blockchain, conf, dal, logger) => {

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

  const saveBlocksInMainBranch = (blocks) => co(function *() {
    // VERY FIRST: parameters, otherwise we compute wrong variables such as UDTime
    if (blocks[0].number == 0) {
      yield blockchain.saveParametersForRoot(blocks[0], conf, dal)
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
    for (const block of blocks) {
      block.fork = false;
    }
    // Transactions recording
    yield updateTransactionsForBlocks(blocks, getBlockByNumberAndHash);
    yield dal.blockDAL.saveBunch(blocks);
    yield DuniterBlockchain.pushStatsForBlocks(blocks, dal);
  });

  function updateTransactionsForBlocks(blocks, getBlockByNumberAndHash) {
    return co(function *() {
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
    })
  }

  const quickApplyBlocks = (blocks, to) => co(function*() {

    sync_memoryDAL.sindexDAL = { getAvailableForConditions: dal.sindexDAL.getAvailableForConditions }
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

        yield blockchain.createNewcomers(local_iindex, dal, logger)

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
          yield blockchain.updateWallets(sync_sindex, sync_memoryDAL)

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
          yield blockchain.updateMembers(block, dal)
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
          yield saveBlocksInMainBranch(blocksToSave);
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
        yield blockchain.checkBlock(block, constants.WITH_SIGNATURES_AND_POW, conf, dal)
        yield blockchain.pushBlock(block, null, conf, dal, logger)

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
      yield saveBlocksInMainBranch(blocksToSave);
    }
  })

  return {
    saveBlocksInMainBranch, quickApplyBlocks
  }
}