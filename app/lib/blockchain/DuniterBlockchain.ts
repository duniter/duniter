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

import {MiscIndexedBlockchain} from "./MiscIndexedBlockchain"
import {FullIindexEntry, IindexEntry, IndexEntry, Indexer, MindexEntry, SindexEntry} from "../indexer"
import {BlockchainOperator} from "./interfaces/BlockchainOperator"
import {ConfDTO} from "../dto/ConfDTO"
import {BlockDTO} from "../dto/BlockDTO"
import {DBHead} from "../db/DBHead"
import {DBBlock} from "../db/DBBlock"
import {CHECK} from "../rules/index"
import {RevocationDTO} from "../dto/RevocationDTO"
import {IdentityDTO} from "../dto/IdentityDTO"
import {CertificationDTO} from "../dto/CertificationDTO"
import {MembershipDTO} from "../dto/MembershipDTO"
import {TransactionDTO} from "../dto/TransactionDTO"
import {CommonConstants} from "../common-libs/constants"
import {FileDAL} from "../dal/fileDAL"
import {DBTx} from "../dal/sqliteDAL/TxsDAL"
import {DataErrors} from "../common-libs/errors"

const _ = require('underscore')

export class DuniterBlockchain extends MiscIndexedBlockchain {

  constructor(blockchainStorage:BlockchainOperator, dal:FileDAL) {
    super(blockchainStorage, dal.mindexDAL, dal.iindexDAL, dal.sindexDAL, dal.cindexDAL)
  }

  static async checkBlock(block:BlockDTO, withPoWAndSignature:boolean, conf: ConfDTO, dal:FileDAL) {
    const index = Indexer.localIndex(block, conf)
    if (withPoWAndSignature) {
      await CHECK.ASYNC.ALL_LOCAL(block, conf, index)
    }
    else {
      await CHECK.ASYNC.ALL_LOCAL_BUT_POW(block, conf, index)
    }
    const HEAD = await Indexer.completeGlobalScope(block, conf, index, dal);
    const HEAD_1 = await dal.bindexDAL.head(1);
    const mindex = Indexer.mindex(index);
    const iindex = Indexer.iindex(index);
    const sindex = Indexer.sindex(index);
    const cindex = Indexer.cindex(index);
    // BR_G49
    if (Indexer.ruleVersion(HEAD, HEAD_1) === false) throw Error('ruleVersion');
    // BR_G50
    if (Indexer.ruleBlockSize(HEAD) === false) throw Error('ruleBlockSize');
    // BR_G98
    if (Indexer.ruleCurrency(block, HEAD) === false) throw Error('ruleCurrency');
    // BR_G51
    if (Indexer.ruleNumber(block, HEAD) === false) throw Error('ruleNumber');
    // BR_G52
    if (Indexer.rulePreviousHash(block, HEAD) === false) throw Error('rulePreviousHash');
    // BR_G53
    if (Indexer.rulePreviousIssuer(block, HEAD) === false) throw Error('rulePreviousIssuer');
    // BR_G101
    if (Indexer.ruleIssuerIsMember(HEAD) === false) throw Error('ruleIssuerIsMember');
    // BR_G54
    if (Indexer.ruleIssuersCount(block, HEAD) === false) throw Error('ruleIssuersCount');
    // BR_G55
    if (Indexer.ruleIssuersFrame(block, HEAD) === false) throw Error('ruleIssuersFrame');
    // BR_G56
    if (Indexer.ruleIssuersFrameVar(block, HEAD) === false) throw Error('ruleIssuersFrameVar');
    // BR_G57
    if (Indexer.ruleMedianTime(block, HEAD) === false) {
      throw Error('ruleMedianTime')
    }
    // BR_G58
    if (Indexer.ruleDividend(block, HEAD) === false) throw Error('ruleDividend');
    // BR_G59
    if (Indexer.ruleUnitBase(block, HEAD) === false) throw Error('ruleUnitBase');
    // BR_G60
    if (Indexer.ruleMembersCount(block, HEAD) === false) throw Error('ruleMembersCount');
    // BR_G61
    if (Indexer.rulePowMin(block, HEAD) === false) throw Error('rulePowMin');
    if (withPoWAndSignature) {
      // BR_G62
      if (Indexer.ruleProofOfWork(HEAD) === false) throw Error('ruleProofOfWork');
    }
    // BR_G63
    if (Indexer.ruleIdentityWritability(iindex, conf) === false) throw Error('ruleIdentityWritability');
    // BR_G64
    if (Indexer.ruleMembershipWritability(mindex, conf) === false) throw Error('ruleMembershipWritability');
    // BR_G108
    if (Indexer.ruleMembershipPeriod(mindex) === false) throw Error('ruleMembershipPeriod');
    // BR_G65
    if (Indexer.ruleCertificationWritability(cindex, conf) === false) throw Error('ruleCertificationWritability');
    // BR_G66
    if (Indexer.ruleCertificationStock(cindex, conf) === false) throw Error('ruleCertificationStock');
    // BR_G67
    if (Indexer.ruleCertificationPeriod(cindex) === false) throw Error('ruleCertificationPeriod');
    // BR_G68
    if (Indexer.ruleCertificationFromMember(HEAD, cindex) === false) throw Error('ruleCertificationFromMember');
    // BR_G69
    if (Indexer.ruleCertificationToMemberOrNewcomer(cindex) === false) throw Error('ruleCertificationToMemberOrNewcomer');
    // BR_G70
    if (Indexer.ruleCertificationToLeaver(cindex) === false) throw Error('ruleCertificationToLeaver');
    // BR_G71
    if (Indexer.ruleCertificationReplay(cindex) === false) throw Error('ruleCertificationReplay');
    // BR_G72
    if (Indexer.ruleCertificationSignature(cindex) === false) throw Error('ruleCertificationSignature');
    // BR_G73
    if (Indexer.ruleIdentityUIDUnicity(iindex) === false) throw Error('ruleIdentityUIDUnicity');
    // BR_G74
    if (Indexer.ruleIdentityPubkeyUnicity(iindex) === false) throw Error('ruleIdentityPubkeyUnicity');
    // BR_G75
    if (Indexer.ruleMembershipSuccession(mindex) === false) throw Error('ruleMembershipSuccession');
    // BR_G76
    if (Indexer.ruleMembershipDistance(HEAD, mindex) === false) throw Error('ruleMembershipDistance');
    // BR_G77
    if (Indexer.ruleMembershipOnRevoked(mindex) === false) throw Error('ruleMembershipOnRevoked');
    // BR_G78
    if (Indexer.ruleMembershipJoinsTwice(mindex) === false) throw Error('ruleMembershipJoinsTwice');
    // BR_G79
    if (Indexer.ruleMembershipEnoughCerts(mindex) === false) throw Error('ruleMembershipEnoughCerts');
    // BR_G80
    if (Indexer.ruleMembershipLeaverIsMember(mindex) === false) throw Error('ruleMembershipLeaverIsMember');
    // BR_G81
    if (Indexer.ruleMembershipActiveIsMember(mindex) === false) throw Error('ruleMembershipActiveIsMember');
    // BR_G82
    if (Indexer.ruleMembershipRevokedIsMember(mindex) === false) throw Error('ruleMembershipRevokedIsMember');
    // BR_G83
    if (Indexer.ruleMembershipRevokedSingleton(mindex) === false) throw Error('ruleMembershipRevokedSingleton');
    // BR_G84
    if (Indexer.ruleMembershipRevocationSignature(mindex) === false) throw Error('ruleMembershipRevocationSignature');
    // BR_G85
    if (Indexer.ruleMembershipExcludedIsMember(iindex) === false) throw Error('ruleMembershipExcludedIsMember');
    // BR_G86
    if ((await Indexer.ruleToBeKickedArePresent(iindex, dal)) === false) throw Error('ruleToBeKickedArePresent');
    // BR_G103
    if (Indexer.ruleTxWritability(sindex) === false) throw Error('ruleTxWritability');
    // BR_G87
    if (Indexer.ruleInputIsAvailable(sindex) === false) throw Error('ruleInputIsAvailable');
    // BR_G88
    if (Indexer.ruleInputIsUnlocked(sindex) === false) throw Error('ruleInputIsUnlocked');
    // BR_G89
    if (Indexer.ruleInputIsTimeUnlocked(sindex) === false) throw Error('ruleInputIsTimeUnlocked');
    // BR_G90
    if (Indexer.ruleOutputBase(sindex, HEAD_1) === false) throw Error('ruleOutputBase');
    // Check document's coherence

    const matchesList = (regexp:RegExp, list:string[]) => {
      let i = 0;
      let found = "";
      while (!found && i < list.length) {
        found = list[i].match(regexp) ? list[i] : "";
        i++;
      }
      return found;
    }

    const isMember = await dal.isMember(block.issuer);
    if (!isMember) {
      if (block.number == 0) {
        if (!matchesList(new RegExp('^' + block.issuer + ':'), block.joiners)) {
          throw Error('Block not signed by the root members');
        }
      } else {
        throw Error('Block must be signed by an existing member');
      }
    }

    // Generate the local index
    // Check the local rules
    // Enrich with the global index
    // Check the global rules
    return { index, HEAD }
  }

  async pushTheBlock(obj:BlockDTO, index:IndexEntry[], HEAD:DBHead | null, conf:ConfDTO, dal:FileDAL, logger:any) {
    const start = Date.now();
    const block = BlockDTO.fromJSONObject(obj)
    try {
      const currentBlock = await dal.getCurrentBlockOrNull();
      block.fork = false;
      const added = await this.saveBlockData(currentBlock, block, conf, dal, logger, index, HEAD);

      try {
        await DuniterBlockchain.pushStatsForBlocks([block], dal);
      } catch (e) {
        logger.warn("An error occurred after the add of the block", e.stack || e);
      }

      logger.info('Block #' + block.number + ' added to the blockchain in %s ms', (Date.now() - start));
      return BlockDTO.fromJSONObject(added)
    }
    catch(err) {
      throw err;
    }

    // Enrich the index with post-HEAD indexes
    // Push the block into the blockchain
    // await supra.pushBlock(b)
    // await supra.recordIndex(index)
  }

  async saveBlockData(current:DBBlock|null, block:BlockDTO, conf:ConfDTO, dal:FileDAL, logger:any, index:IndexEntry[], HEAD:DBHead | null) {
    if (block.number == 0) {
      await this.saveParametersForRoot(block, conf, dal);
    }

    const indexes = await dal.generateIndexes(block, conf, index, HEAD);

    // Newcomers
    await this.createNewcomers(indexes.iindex, dal, logger);

    // Save indexes
    await dal.bindexDAL.saveEntity(indexes.HEAD);
    await dal.mindexDAL.insertBatch(indexes.mindex);
    await dal.iindexDAL.insertBatch(indexes.iindex);
    await dal.sindexDAL.insertBatch(indexes.sindex);
    await dal.cindexDAL.insertBatch(indexes.cindex);

    // Create/Update nodes in wotb
    await this.updateMembers(block, dal);

    // Update the wallets' blances
    await this.updateWallets(indexes.sindex, dal)

    const TAIL = await dal.bindexDAL.tail();
    const bindexSize = [
      TAIL.issuersCount,
      TAIL.issuersFrame,
      conf.medianTimeBlocks,
      conf.dtDiffEval
    ].reduce((max, value) => {
      return Math.max(max, value);
    }, 0);
    const MAX_BINDEX_SIZE = conf.forksize + bindexSize
    const currentSize = indexes.HEAD.number - TAIL.number + 1
    if (currentSize > MAX_BINDEX_SIZE) {
      await dal.trimIndexes(indexes.HEAD.number - MAX_BINDEX_SIZE);
    }

    const dbb = DBBlock.fromBlockDTO(block)
    this.updateBlocksComputedVars(current, dbb)

    // --> Update links
    await dal.updateWotbLinks(indexes.cindex);

    // Create/Update certifications
    await DuniterBlockchain.removeCertificationsFromSandbox(block, dal);
    // Create/Update memberships
    await this.removeMembershipsFromSandbox(block, dal);
    // Compute to be revoked members
    await this.computeToBeRevoked(indexes.mindex, dal);
    // Delete eventually present transactions
    await this.deleteTransactions(block, dal);

    await dal.trimSandboxes(block);
    // Saves the block (DAL)
    await dal.saveBlock(dbb);

    return dbb
  }

  async saveParametersForRoot(block:BlockDTO, conf:ConfDTO, dal:FileDAL) {
    if (block.parameters) {
      const bconf = BlockDTO.getConf(block)
      conf.c = bconf.c;
      conf.dt = bconf.dt;
      conf.ud0 = bconf.ud0;
      conf.sigPeriod = bconf.sigPeriod;
      conf.sigStock = bconf.sigStock;
      conf.sigWindow = bconf.sigWindow;
      conf.sigValidity = bconf.sigValidity;
      conf.sigQty = bconf.sigQty;
      conf.idtyWindow = bconf.idtyWindow;
      conf.msWindow = bconf.msWindow;
      conf.xpercent = bconf.xpercent;
      conf.msValidity = bconf.msValidity;
      conf.stepMax = bconf.stepMax;
      conf.medianTimeBlocks = bconf.medianTimeBlocks;
      conf.avgGenTime = bconf.avgGenTime;
      conf.dtDiffEval = bconf.dtDiffEval;
      conf.percentRot = bconf.percentRot;
      conf.udTime0 = bconf.udTime0;
      conf.udReevalTime0 = bconf.udReevalTime0;
      conf.dtReeval = bconf.dtReeval;
      conf.currency = bconf.currency;
      // Super important: adapt wotb module to handle the correct stock
      dal.wotb.setMaxCert(conf.sigStock);
      return dal.saveConf(conf);
    }
  }

  async createNewcomers(iindex:IindexEntry[], dal:FileDAL, logger:any) {
    for (const i of iindex) {
      if (i.op == CommonConstants.IDX_CREATE) {
        const entry = i as FullIindexEntry
        // Reserves a wotb ID
        entry.wotb_id = dal.wotb.addNode();
        logger.trace('%s was affected wotb_id %s', entry.uid, entry.wotb_id);
        // Remove from the sandbox any other identity with the same pubkey/uid, since it has now been reserved.
        await dal.removeUnWrittenWithPubkey(entry.pub)
        await dal.removeUnWrittenWithUID(entry.uid)
      }
    }
  }

  async updateMembers(block:BlockDTO, dal:FileDAL) {
    // Joiners (come back)
    for (const inlineMS of block.joiners) {
      let ms = MembershipDTO.fromInline(inlineMS)
      const idty = await dal.getWrittenIdtyByPubkeyForWotbID(ms.issuer);
      dal.wotb.setEnabled(true, idty.wotb_id);
    }
    // Revoked
    for (const inlineRevocation of block.revoked) {
      let revocation = RevocationDTO.fromInline(inlineRevocation)
      await dal.revokeIdentity(revocation.pubkey)
    }
    // Excluded
    for (const excluded of block.excluded) {
      const idty = await dal.getWrittenIdtyByPubkeyForWotbID(excluded);
      dal.wotb.setEnabled(false, idty.wotb_id);
    }
  }

  async updateWallets(sindex:SindexEntry[], aDal:any, reverse = false) {
    const differentConditions = _.uniq(sindex.map((entry) => entry.conditions))
    for (const conditions of differentConditions) {
      const creates = _.filter(sindex, (entry:SindexEntry) => entry.conditions === conditions && entry.op === CommonConstants.IDX_CREATE)
      const updates = _.filter(sindex, (entry:SindexEntry) => entry.conditions === conditions && entry.op === CommonConstants.IDX_UPDATE)
      const positives = creates.reduce((sum:number, src:SindexEntry) => sum + src.amount * Math.pow(10, src.base), 0)
      const negatives = updates.reduce((sum:number, src:SindexEntry) => sum + src.amount * Math.pow(10, src.base), 0)
      const wallet = await aDal.getWallet(conditions)
      let variation = positives - negatives
      if (reverse) {
        // To do the opposite operations, for a reverted block
        variation *= -1
      }
      wallet.balance += variation
      await aDal.saveWallet(wallet)
    }
  }

  async revertBlock(number:number, hash:string, dal:FileDAL) {

    const blockstamp = [number, hash].join('-');
    const block = await dal.getBlockByBlockstampOrNull(blockstamp)

    if (!block) {
      throw DataErrors[DataErrors.BLOCK_TO_REVERT_NOT_FOUND]
    }

    // Revert links
    const writtenOn = await dal.cindexDAL.getWrittenOn(blockstamp);
    for (const entry of writtenOn) {
      const from = await dal.getWrittenIdtyByPubkeyForWotbID(entry.issuer);
      const to = await dal.getWrittenIdtyByPubkeyForWotbID(entry.receiver);
      if (entry.op == CommonConstants.IDX_CREATE) {
        // We remove the created link
        dal.wotb.removeLink(from.wotb_id, to.wotb_id);
      } else {
        // We add the removed link
        dal.wotb.addLink(from.wotb_id, to.wotb_id);
      }
    }

    // Revert nodes
    await this.undoMembersUpdate(blockstamp, dal);

    // Get the money movements to revert in the balance
    const REVERSE_BALANCE = true
    const sindexOfBlock = await dal.sindexDAL.getWrittenOn(blockstamp)

    await dal.bindexDAL.removeBlock(number);
    await dal.mindexDAL.removeBlock(blockstamp);
    await dal.iindexDAL.removeBlock(blockstamp);
    await dal.cindexDAL.removeBlock(blockstamp);
    await dal.sindexDAL.removeBlock(blockstamp);

    // Then: normal updates
    const previousBlock = await dal.getBlock(number - 1);
    // Set the block as SIDE block (equivalent to removal from main branch)
    await dal.blockDAL.setSideBlock(number, previousBlock);

    // Revert the balances variations for this block
    await this.updateWallets(sindexOfBlock, dal, REVERSE_BALANCE)

    // Restore block's transaction as incoming transactions
    await this.undoDeleteTransactions(block, dal)

    return block
  }

  async undoMembersUpdate(blockstamp:string, dal:FileDAL) {
    const joiners = await dal.iindexDAL.getWrittenOn(blockstamp);
    for (const entry of joiners) {
      // Undo 'join' which can be either newcomers or comebackers
      // => equivalent to i_index.member = true AND i_index.op = 'UPDATE'
      if (entry.member === true && entry.op === CommonConstants.IDX_UPDATE) {
        const idty = await dal.getWrittenIdtyByPubkeyForWotbID(entry.pub);
        dal.wotb.setEnabled(false, idty.wotb_id);
      }
    }
    const newcomers = await dal.iindexDAL.getWrittenOn(blockstamp);
    for (const entry of newcomers) {
      // Undo newcomers
      // => equivalent to i_index.op = 'CREATE'
      if (entry.op === CommonConstants.IDX_CREATE) {
        // Does not matter which one it really was, we pop the last X identities
        dal.wotb.removeNode();
      }
    }
    const excluded = await dal.iindexDAL.getWrittenOn(blockstamp);
    for (const entry of excluded) {
      // Undo excluded (make them become members again in wotb)
      // => equivalent to m_index.member = false
      if (entry.member === false && entry.op === CommonConstants.IDX_UPDATE) {
        const idty = await dal.getWrittenIdtyByPubkeyForWotbID(entry.pub);
        dal.wotb.setEnabled(true, idty.wotb_id);
      }
    }
  }

  async undoDeleteTransactions(block:DBBlock, dal:FileDAL) {
    for (const obj of block.transactions) {
      obj.currency = block.currency;
      let tx = TransactionDTO.fromJSONObject(obj)
      await dal.saveTransaction(DBTx.fromTransactionDTO(tx))
    }
  }

  /**
   * Delete certifications from the sandbox since it has been written.
   *
   * @param block Block in which are contained the certifications to remove from sandbox.
   * @param dal The DAL
   */
  static async removeCertificationsFromSandbox(block:BlockDTO, dal:FileDAL) {
    for (let inlineCert of block.certifications) {
      let cert = CertificationDTO.fromInline(inlineCert)
      let idty = await dal.getWrittenIdtyByPubkeyForHashing(cert.to);
      await dal.deleteCert({
        from: cert.from,
        target: IdentityDTO.getTargetHash(idty),
        sig: cert.sig,
      });
    }
  }

  /**
   * Delete memberships from the sandbox since it has been written.
   *
   * @param block Block in which are contained the certifications to remove from sandbox.
   * @param dal The DAL
   */
  async removeMembershipsFromSandbox(block:BlockDTO, dal:FileDAL) {
    const mss = block.joiners.concat(block.actives).concat(block.leavers);
    for (const inlineMS of mss) {
      let ms = MembershipDTO.fromInline(inlineMS)
      await dal.deleteMS({
        issuer: ms.issuer,
        signature: ms.signature
      });
    }
  }

  async computeToBeRevoked(mindex:MindexEntry[], dal:FileDAL) {
    const revocations = _.filter(mindex, (entry:MindexEntry) => entry.revoked_on);
    for (const revoked of revocations) {
      await dal.setRevoked(revoked.pub)
    }
  }

  async deleteTransactions(block:BlockDTO, dal:FileDAL) {
    for (const obj of block.transactions) {
      obj.currency = block.currency;
      const tx = TransactionDTO.fromJSONObject(obj)
      const txHash = tx.getHash();
      await dal.removeTxByHash(txHash);
    }
  }

  updateBlocksComputedVars(
    current:{ unitbase:number, monetaryMass:number }|null,
    block:{ number:number, unitbase:number, dividend:number|null, membersCount:number, monetaryMass:number }): void {
    // Unit Base
    block.unitbase = (block.dividend && block.unitbase) || (current && current.unitbase) || 0;
    // Monetary Mass update
    if (current) {
      block.monetaryMass = (current.monetaryMass || 0)
        + (block.dividend || 0) * Math.pow(10, block.unitbase || 0) * block.membersCount;
    } else {
      block.monetaryMass = 0
    }
    // UD Time update
    if (block.number == 0) {
      block.dividend = null;
    }
    else if (!block.dividend) {
      block.dividend = null;
    }
  }

  static pushStatsForBlocks(blocks:BlockDTO[], dal:FileDAL) {
    const stats: { [k:string]: { blocks: number[], lastParsedBlock:number }} = {};
    // Stats
    for (const block of blocks) {
      const values = [
        { name: 'newcomers', value: block.identities },
        { name: 'certs',     value: block.certifications },
        { name: 'joiners',   value: block.joiners },
        { name: 'actives',   value: block.actives },
        { name: 'leavers',   value: block.leavers },
        { name: 'revoked',   value: block.revoked },
        { name: 'excluded',  value: block.excluded },
        { name: 'ud',        value: block.dividend },
        { name: 'tx',        value: block.transactions }
      ]
      for (const element of values) {
        if (!stats[element.name]) {
          stats[element.name] = { blocks: [], lastParsedBlock: -1 };
        }
        const stat = stats[element.name]
        const isPositiveValue = element.value && typeof element.value != 'object';
        const isNonEmptyArray = element.value && typeof element.value == 'object' && element.value.length > 0;
        if (isPositiveValue || isNonEmptyArray) {
          stat.blocks.push(block.number);
        }
        stat.lastParsedBlock = block.number;
      }
    }
    return dal.pushStats(stats);
  }

  async pushSideBlock(obj:BlockDTO, dal:FileDAL, logger:any) {
    const start = Date.now();
    const block = DBBlock.fromBlockDTO(BlockDTO.fromJSONObject(obj))
    block.fork = true;
    try {
      // Saves the block (DAL)
      block.wrong = false;
      await dal.saveSideBlockInFile(block);
      logger.info('SIDE Block #%s-%s added to the blockchain in %s ms', block.number, block.hash.substr(0, 8), (Date.now() - start));
      return block;
    } catch (err) {
      throw err;
    }
  }

  async revertHead() {
    const indexRevert = super.indexRevert
    const headf = super.head
    const head = await headf()
    await indexRevert(head.number)
  }
}
