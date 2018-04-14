// Source file from duniter: Crypto-currency software to manage libre currency such as Ğ1
// Copyright (C) 2018  Cedric Moreau <cem.moreau@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

"use strict"
import {DuniterBlockchain} from "../blockchain/DuniterBlockchain";
import {BlockDTO} from "../dto/BlockDTO";
import {DBTransaction} from "../db/DBTransaction";
import {AccountsGarbagingDAL, Indexer} from "../indexer";
import {CurrencyConfDTO} from "../dto/ConfDTO";
import {FileDAL} from "../dal/fileDAL"
import {DBBlock} from "../db/DBBlock"
import {DBTx} from "../dal/sqliteDAL/TxsDAL"

const _ = require('underscore')
const constants = require('../constants')

let sync_bindex: any [] = [];
let sync_iindex: any[] = [];
let sync_mindex: any[] = [];
let sync_cindex: any[] = [];
let sync_sindex: any[] = [];
let sync_bindexSize = 0;
let sync_allBlocks: BlockDTO[] = [];
let sync_expires: number[] = [];
let sync_nextExpiring = 0;
let sync_currConf: CurrencyConfDTO;
const sync_memoryWallets: any = {}
const sync_memoryDAL:AccountsGarbagingDAL = {
  getWallet: (conditions: string) => Promise.resolve(sync_memoryWallets[conditions] || { conditions, balance: 0 }),
  saveWallet: async (wallet: any) => {
    // Make a copy
    sync_memoryWallets[wallet.conditions] = {
      conditions: wallet.conditions,
      balance: wallet.balance
    }
  },
  sindexDAL: {
    getAvailableForConditions: (conditions:string) => null
  }
}

export class QuickSynchronizer {

  constructor(private blockchain:DuniterBlockchain, private conf: any, private dal:FileDAL, private logger: any) {
  }

  async saveBlocksInMainBranch(blocks: BlockDTO[]): Promise<void> {
    // VERY FIRST: parameters, otherwise we compute wrong variables such as UDTime
    if (blocks[0].number == 0) {
      await this.blockchain.saveParametersForRoot(blocks[0], this.conf, this.dal)
    }
    // Helper to retrieve a block with local cache
    const getBlock = async (number: number): Promise<BlockDTO> => {
      const firstLocalNumber = blocks[0].number;
      if (number >= firstLocalNumber) {
        let offset = number - firstLocalNumber;
        return Promise.resolve(blocks[offset])
      }
      return BlockDTO.fromJSONObject(await this.dal.getBlockWeHaveItForSure(number))
    };
    const getBlockByNumberAndHash = async (number: number, hash: string): Promise<BlockDTO> => {
      const block = await getBlock(number);
      if (!block || block.hash != hash) {
        throw 'Block #' + [number, hash].join('-') + ' not found neither in DB nor in applying blocks';
      }
      return block;
    }
    for (const block of blocks) {
      block.fork = false;
      const current:BlockDTO|null = block.number > 0 ? await getBlock(block.number - 1) : null
      this.blockchain.updateBlocksComputedVars(current, block)
    }
    // Transactions recording
    await this.updateTransactionsForBlocks(blocks, getBlockByNumberAndHash);
    await this.dal.blockDAL.saveBunch(blocks.map(b => DBBlock.fromBlockDTO(b)));
    await DuniterBlockchain.pushStatsForBlocks(blocks, this.dal);
  }

  private async updateTransactionsForBlocks(blocks: BlockDTO[], getBlockByNumberAndHash: (number: number, hash: string) => Promise<BlockDTO>): Promise<any> {
    let txs: DBTransaction[] = [];
    for (const block of blocks) {
      const newOnes: DBTransaction[] = [];
      for (const tx of block.transactions) {
        const [number, hash] = tx.blockstamp.split('-')
        const refBlock: BlockDTO = (await getBlockByNumberAndHash(parseInt(number), hash))
        // We force the usage of the reference block's currency
        tx.currency = refBlock.currency
        tx.hash = tx.getHash()
        const dbTx: DBTransaction = DBTransaction.fromTransactionDTO(tx, refBlock.medianTime, true, false, refBlock.number, refBlock.medianTime)
        newOnes.push(dbTx)
      }
      txs = txs.concat(newOnes);
    }
    return this.dal.updateTransactions(txs.map(t => DBTx.fromTransactionDTO(t)))
  }

  async quickApplyBlocks(blocks:BlockDTO[], to: number): Promise<void> {

    sync_memoryDAL.sindexDAL = { getAvailableForConditions: (conditions:string) => this.dal.sindexDAL.getAvailableForConditions(conditions) }
    let blocksToSave: BlockDTO[] = [];

    for (const block of blocks) {
      sync_allBlocks.push(block);

      // The new kind of object stored
      const dto = BlockDTO.fromJSONObject(block)

      if (block.number == 0) {
        sync_currConf = BlockDTO.getConf(block);
      }

      if (block.number <= to - this.conf.forksize) {
        blocksToSave.push(dto);
        const index:any = Indexer.localIndex(dto, sync_currConf);
        const local_iindex = Indexer.iindex(index);
        const local_cindex = Indexer.cindex(index);
        const local_sindex = Indexer.sindex(index);
        const local_mindex = Indexer.mindex(index);
        sync_iindex = sync_iindex.concat(local_iindex);
        sync_cindex = sync_cindex.concat(local_cindex);
        sync_mindex = sync_mindex.concat(local_mindex);

        const HEAD = await Indexer.quickCompleteGlobalScope(block, sync_currConf, sync_bindex, sync_iindex, sync_mindex, sync_cindex, ({
          getBlock: (number: number) => {
            return Promise.resolve(sync_allBlocks[number]);
          },
          getBlockByBlockstamp: (blockstamp: string) => {
            return Promise.resolve(sync_allBlocks[parseInt(blockstamp)]);
          }
        }) as any);
        sync_bindex.push(HEAD);

        // Remember expiration dates
        for (const entry of index) {
          if (entry.expires_on) {
            sync_expires.push(entry.expires_on)
          }
          if (entry.revokes_on) {
            sync_expires.push(entry.revokes_on)
          }
        }
        sync_expires = _.uniq(sync_expires);

        await this.blockchain.createNewcomers(local_iindex, this.dal, this.logger)

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
          const currentNextExpiring = sync_nextExpiring
          sync_nextExpiring = sync_expires.reduce((max, value) => max ? Math.min(max, value) : value, 9007199254740991); // Far far away date
          const nextExpiringChanged = currentNextExpiring !== sync_nextExpiring

          // Fills in correctly the SINDEX
          await Promise.all(_.where(sync_sindex.concat(local_sindex), { op: 'UPDATE' }).map(async (entry: any) => {
            if (!entry.conditions) {
              const src = await this.dal.sindexDAL.getSource(entry.identifier, entry.pos);
              entry.conditions = src.conditions;
            }
          }))

          // Flush the INDEX (not bindex, which is particular)
          await this.dal.mindexDAL.insertBatch(sync_mindex);
          await this.dal.iindexDAL.insertBatch(sync_iindex);
          await this.dal.sindexDAL.insertBatch(sync_sindex);
          await this.dal.cindexDAL.insertBatch(sync_cindex);
          sync_mindex = [];
          sync_iindex = [];
          sync_cindex = [];
          sync_sindex = local_sindex;

          sync_sindex = sync_sindex.concat(await Indexer.ruleIndexGenDividend(HEAD, this.dal));
          sync_sindex = sync_sindex.concat(await Indexer.ruleIndexGarbageSmallAccounts(HEAD, sync_sindex, sync_memoryDAL));
          if (nextExpiringChanged) {
            sync_cindex = sync_cindex.concat(await Indexer.ruleIndexGenCertificationExpiry(HEAD, this.dal));
            sync_mindex = sync_mindex.concat(await Indexer.ruleIndexGenMembershipExpiry(HEAD, this.dal));
            sync_iindex = sync_iindex.concat(await Indexer.ruleIndexGenExclusionByMembership(HEAD, sync_mindex, this.dal));
            sync_iindex = sync_iindex.concat(await Indexer.ruleIndexGenExclusionByCertificatons(HEAD, sync_cindex, local_iindex, this.conf, this.dal));
            sync_mindex = sync_mindex.concat(await Indexer.ruleIndexGenImplicitRevocation(HEAD, this.dal));
          }
          // Update balances with UD + local garbagings
          await this.blockchain.updateWallets(sync_sindex, sync_memoryDAL)

          // --> Update links
          await this.dal.updateWotbLinks(local_cindex.concat(sync_cindex));

          // Flush the INDEX again
          await this.dal.mindexDAL.insertBatch(sync_mindex);
          await this.dal.iindexDAL.insertBatch(sync_iindex);
          await this.dal.sindexDAL.insertBatch(sync_sindex);
          await this.dal.cindexDAL.insertBatch(sync_cindex);
          sync_mindex = [];
          sync_iindex = [];
          sync_cindex = [];
          sync_sindex = [];

          // Create/Update nodes in wotb
          await this.blockchain.updateMembers(block, this.dal)
        }

        // Trim the bindex
        sync_bindexSize = this.conf.forksize + [
          block.issuersCount,
          block.issuersFrame,
          this.conf.medianTimeBlocks,
          this.conf.dtDiffEval,
          blocks.length
        ].reduce((max, value) => {
          return Math.max(max, value);
        }, 0);

        if (sync_bindexSize && sync_bindex.length >= 2 * sync_bindexSize) {
          // We trim it, not necessary to store it all (we already store the full blocks)
          sync_bindex.splice(0, sync_bindexSize);

          // Process triming continuously to avoid super long ending of sync
          await this.dal.trimIndexes(sync_bindex[0].number);
        }
      } else {

        if (blocksToSave.length) {
          await this.saveBlocksInMainBranch(blocksToSave);
        }
        blocksToSave = [];

        // Save the INDEX
        await this.dal.bindexDAL.insertBatch(sync_bindex);
        await this.dal.mindexDAL.insertBatch(sync_mindex);
        await this.dal.iindexDAL.insertBatch(sync_iindex);
        await this.dal.sindexDAL.insertBatch(sync_sindex);
        await this.dal.cindexDAL.insertBatch(sync_cindex);

        // Save the intermediary table of wallets
        const conditions = _.keys(sync_memoryWallets)
        const nonEmptyKeys = _.filter(conditions, (k: any) => sync_memoryWallets[k] && sync_memoryWallets[k].balance > 0)
        const walletsToRecord = nonEmptyKeys.map((k: any) => sync_memoryWallets[k])
        await this.dal.walletDAL.insertBatch(walletsToRecord)
        for (const cond of conditions) {
          delete sync_memoryWallets[cond]
        }

        if (block.number === 0) {
          await this.blockchain.saveParametersForRoot(block, this.conf, this.dal)
        }

        // Last block: cautious mode to trigger all the INDEX expiry mechanisms
        const { index, HEAD } = await DuniterBlockchain.checkBlock(dto, constants.WITH_SIGNATURES_AND_POW, this.conf, this.dal)
        await this.blockchain.pushTheBlock(dto, index, HEAD, this.conf, this.dal, this.logger)

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
        // sync_currConf = {};
      }
    }
    if (blocksToSave.length) {
      await this.saveBlocksInMainBranch(blocksToSave);
    }
  }
}
