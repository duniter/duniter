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

import { BlockDTO } from "../dto/BlockDTO";
import { DuniterBlockchain } from "../blockchain/DuniterBlockchain";
import { DBHead } from "../db/DBHead";
import { FileDAL } from "../dal/fileDAL";
import { DBBlock } from "../db/DBBlock";
import { Underscore } from "../common-libs/underscore";
import { DataErrors } from "../common-libs/errors";
import { Map } from "../common-libs/crypto/map";

const indexer = require("../indexer").Indexer;
const constants = require("../constants");

export class BlockchainContext {
  private conf: any;
  private dal: FileDAL;
  private logger: any;

  /**
   * The virtual next HEAD. Computed each time a new block is added, because a lot of HEAD variables are deterministic
   * and can be computed one, just after a block is added for later controls.
   */
  private vHEAD: any;

  /**
   * The currently written HEAD, aka. HEAD_1 relatively to incoming HEAD.
   */
  private vHEAD_1: any;

  private HEADrefreshed: Promise<void> = Promise.resolve();

  /**
   * Refresh the virtual HEAD value for determined variables of the next coming block, avoiding to recompute them
   * each time a new block arrives to check if the values are correct. We can know and store them early on, in vHEAD.
   */
  private refreshHead(): Promise<void> {
    this.HEADrefreshed = (async () => {
      this.vHEAD_1 = await this.dal.head(1);
      // We suppose next block will have same version #, and no particular data in the block (empty index)
      let block;
      // But if no HEAD_1 exist, we must initialize a block with default values
      if (!this.vHEAD_1) {
        block = {
          version: constants.BLOCK_GENESIS_VERSION,
          time: Math.round(Date.now() / 1000),
          powMin: this.conf.powMin || 0,
          powZeros: 0,
          powRemainder: 0,
          avgBlockSize: 0,
        };
      } else {
        block = { version: this.vHEAD_1.version };
      }
      this.vHEAD = await indexer.completeGlobalScope(
        BlockDTO.fromJSONObject(block),
        this.conf,
        [],
        this.dal
      );
    })();
    return this.HEADrefreshed;
  }

  /**
   * Gets a copy of vHEAD, extended with some extra properties.
   * @param props The extra properties to add.
   */
  async getvHeadCopy(props: any = {}): Promise<any> {
    if (!this.vHEAD) {
      await this.refreshHead();
    }
    const copy: any = {};
    const keys = Object.keys(this.vHEAD);
    for (const k of keys) {
      copy[k] = this.vHEAD[k];
    }
    Underscore.extend(copy, props);
    return copy;
  }

  /**
   * Get currently written HEAD.
   */
  async getvHEAD_1(): Promise<any> {
    if (!this.vHEAD) {
      await this.refreshHead();
    }
    return this.vHEAD_1;
  }

  /**
   * Utility method: gives the personalized difficulty level of a given issuer for next block.
   * @param issuer The issuer we want to get the difficulty level.
   */
  async getIssuerPersonalizedDifficulty(issuer: string): Promise<any> {
    const local_vHEAD = await this.getvHeadCopy({ issuer });
    await indexer.preparePersonalizedPoW(
      local_vHEAD,
      this.vHEAD_1,
      (n: number, m: number, p: string = "") => this.dal.range(n, m, p),
      this.conf
    );
    return local_vHEAD.issuerDiff;
  }

  setConfDAL(newConf: any, newDAL: any): void {
    this.dal = newDAL;
    this.conf = newConf;
    this.logger = require("../logger").NewLogger(this.dal.profile);
  }

  async checkBlock(
    block: BlockDTO,
    withPoWAndSignature: boolean,
    ignoreIssuer: boolean
  ): Promise<any> {
    return DuniterBlockchain.checkBlock(
      block,
      withPoWAndSignature,
      ignoreIssuer,
      this.conf,
      this.dal
    );
  }

  private async addBlock(
    obj: BlockDTO,
    index: any = null,
    HEAD: DBHead | null = null,
    trim: boolean
  ): Promise<BlockDTO> {
    const block = await DuniterBlockchain.pushTheBlock(
      obj,
      index,
      HEAD,
      this.conf,
      this.dal,
      this.logger,
      trim
    );
    this.vHEAD_1 = this.vHEAD = null;
    return block;
  }

  async addSideBlock(obj: BlockDTO): Promise<BlockDTO> {
    const dbb = await DuniterBlockchain.pushSideBlock(
      obj,
      this.dal,
      this.logger
    );
    return dbb.toBlockDTO();
  }

  async revertCurrentBlock(): Promise<DBBlock> {
    const head_1 = await this.dal.bindexDAL.head(1);
    this.logger.debug("Reverting block #%s-%s...", head_1.number, head_1.hash);
    const block = await this.dal.getAbsoluteValidBlockInForkWindow(
      head_1.number,
      head_1.hash
    );
    if (!block) {
      throw DataErrors[DataErrors.BLOCK_TO_REVERT_NOT_FOUND];
    }
    await DuniterBlockchain.revertBlock(
      head_1.number,
      head_1.hash,
      this.dal,
      block
    );
    // Invalidates the head, since it has changed.
    await this.refreshHead();
    return block;
  }

  async revertCurrentHead() {
    const head_1 = await this.dal.bindexDAL.head(1);
    this.logger.debug("Reverting HEAD~1... (b#%s)", head_1.number);
    await DuniterBlockchain.revertBlock(head_1.number, head_1.hash, this.dal);
    // Invalidates the head, since it has changed.
    await this.refreshHead();
  }

  async applyNextAvailableFork(): Promise<any> {
    const current = await this.current();
    this.logger.debug("Find next potential block #%s...", current.number + 1);
    const forks = await this.dal.getForkBlocksFollowing(current);
    if (!forks.length) {
      throw constants.ERRORS.NO_POTENTIAL_FORK_AS_NEXT;
    }
    const block = forks[0];
    await this.checkAndAddBlock(BlockDTO.fromJSONObject(block));
    this.logger.debug("Applied block #%s", block.number);
  }

  async checkAndAddBlock(block: BlockDTO, trim = true) {
    const { index, HEAD } = await this.checkBlock(
      block,
      constants.WITH_SIGNATURES_AND_POW,
      false
    );
    return await this.addBlock(block, index, HEAD, trim);
  }

  current(): Promise<any> {
    return this.dal.getCurrentBlockOrNull();
  }

  async checkHaveEnoughLinks(
    target: string,
    newLinks: Map<string[]>
  ): Promise<void> {
    const existingLinks = await this.dal.getValidLinksTo(target);
    const existingIssuers = existingLinks.map((value) => value.issuer);
    let count = existingIssuers.length;

    if (newLinks[target] && newLinks[target].length) {
      const uniqIssuers = Underscore.uniq(
        existingIssuers.concat(newLinks[target])
      );
      count = uniqIssuers.length;
    }

    if (count < this.conf.sigQty) {
      throw (
        "Key " +
        target +
        " does not have enough links (" +
        count +
        "/" +
        this.conf.sigQty +
        ")"
      );
    }
  }
}
