"use strict";
import {BlockDTO} from "../dto/BlockDTO"
import {DuniterBlockchain} from "../blockchain/DuniterBlockchain"
import {QuickSynchronizer} from "./QuickSync"
import {DBHead} from "../db/DBHead"
const _               = require('underscore');
const indexer         = require('../indexer').Indexer
const constants       = require('../constants');
const Block           = require('../entity/block');

export class BlockchainContext {

  private conf:any
  private dal:any
  private logger:any
  private blockchain:DuniterBlockchain
  private quickSynchronizer:QuickSynchronizer

  /**
   * The virtual next HEAD. Computed each time a new block is added, because a lot of HEAD variables are deterministic
   * and can be computed one, just after a block is added for later controls.
   */
  private vHEAD:any

  /**
   * The currently written HEAD, aka. HEAD_1 relatively to incoming HEAD.
   */
  private vHEAD_1:any

  private HEADrefreshed: Promise<any> | null = Promise.resolve();

  /**
   * Refresh the virtual HEAD value for determined variables of the next coming block, avoiding to recompute them
   * each time a new block arrives to check if the values are correct. We can know and store them early on, in vHEAD.
   */
  private refreshHead(): Promise<void> {
    this.HEADrefreshed = (async (): Promise<void> => {
      this.vHEAD_1 = await this.dal.head(1);
      // We suppose next block will have same version #, and no particular data in the block (empty index)
      let block;
      // But if no HEAD_1 exist, we must initialize a block with default values
      if (!this.vHEAD_1) {
        block = {
          version: constants.BLOCK_GENERATED_VERSION,
          time: Math.round(Date.now() / 1000),
          powMin: this.conf.powMin || 0,
          powZeros: 0,
          powRemainder: 0,
          avgBlockSize: 0
        };
      } else {
        block = { version: this.vHEAD_1.version };
      }
      this.vHEAD = await indexer.completeGlobalScope(Block.statics.fromJSON(block), this.conf, [], this.dal);
    })()
    return this.HEADrefreshed;
  }

  /**
   * Gets a copy of vHEAD, extended with some extra properties.
   * @param props The extra properties to add.
   */
  async getvHeadCopy(props: any): Promise<any> {
    if (!this.vHEAD) {
      await this.refreshHead();
    }
    const copy: any = {};
    const keys = Object.keys(this.vHEAD);
    for (const k of keys) {
      copy[k] = this.vHEAD[k];
    }
    _.extend(copy, props);
    return copy;
  }

  /**
   * Get currently written HEAD.
   */
  async getvHEAD_1(): Promise<any> {
    if (!this.vHEAD) {
      await this.refreshHead();
    }
    return this.vHEAD_1
  }

  /**
   * Utility method: gives the personalized difficulty level of a given issuer for next block.
   * @param issuer The issuer we want to get the difficulty level.
   */
  async getIssuerPersonalizedDifficulty(issuer: string): Promise<any> {
    const local_vHEAD = await this.getvHeadCopy({ issuer });
    await indexer.preparePersonalizedPoW(local_vHEAD, this.vHEAD_1, (n:number, m:number, p = "") => this.dal.range(n,m,p), this.conf)
    return local_vHEAD.issuerDiff;
  }

  setConfDAL(newConf: any, newDAL: any, theBlockchain: DuniterBlockchain, theQuickSynchronizer: QuickSynchronizer): void {
    this.dal = newDAL;
    this.conf = newConf;
    this.blockchain = theBlockchain
    this.quickSynchronizer = theQuickSynchronizer
    this.logger = require('../logger')(this.dal.profile);
  }

  checkBlock(block: BlockDTO, withPoWAndSignature = true): Promise<any> {
    return this.blockchain.checkBlock(block, withPoWAndSignature, this.conf, this.dal)
  }

  async addBlock(obj: BlockDTO, index: any, HEAD: DBHead): Promise<any> {
    const block = await this.blockchain.pushTheBlock(obj, index, HEAD, this.conf, this.dal, this.logger)
    this.vHEAD_1 = this.vHEAD = this.HEADrefreshed = null
    return block
  }

  addSideBlock(obj:BlockDTO): Promise<any> {
    return this.blockchain.pushSideBlock(obj, this.dal, this.logger)
  }

  async revertCurrentBlock(): Promise<any> {
    const head_1 = await this.dal.bindexDAL.head(1);
    this.logger.debug('Reverting block #%s...', head_1.number);
    const res = await this.blockchain.revertBlock(head_1.number, head_1.hash, this.dal)
    this.logger.debug('Reverted block #%s', head_1.number);
    // Invalidates the head, since it has changed.
    await this.refreshHead();
    return res;
  }

  async applyNextAvailableFork(): Promise<any> {
    const current = await this.current();
    this.logger.debug('Find next potential block #%s...', current.number + 1);
    const forks = await this.dal.getForkBlocksFollowing(current);
    if (!forks.length) {
      throw constants.ERRORS.NO_POTENTIAL_FORK_AS_NEXT;
    }
    const block = forks[0];
    const { index, HEAD } = await this.checkBlock(block, constants.WITH_SIGNATURES_AND_POW);
    await this.addBlock(block, index, HEAD);
    this.logger.debug('Applied block #%s', block.number);
  }

  current(): Promise<any> {
    return this.dal.getCurrentBlockOrNull()
  }

  async checkHaveEnoughLinks(target: string, newLinks: any): Promise<any> {
    const links = await this.dal.getValidLinksTo(target);
    let count = links.length;
    if (newLinks[target] && newLinks[target].length) {
      count += newLinks[target].length;
    }
    if (count < this.conf.sigQty) {
      throw 'Key ' + target + ' does not have enough links (' + count + '/' + this.conf.sigQty + ')';
    }
  }

  quickApplyBlocks(blocks:BlockDTO[], to: number | null): Promise<any> {
    return this.quickSynchronizer.quickApplyBlocks(blocks, to)
  }
}
