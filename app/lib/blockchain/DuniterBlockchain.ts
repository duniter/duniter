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

import {
  BasedAmount,
  FullIindexEntry,
  IindexEntry,
  IndexEntry,
  Indexer,
  MindexEntry,
  SimpleSindexEntryForWallet,
  SimpleUdEntryForWallet,
} from "../indexer";
import { ConfDTO } from "../dto/ConfDTO";
import { BlockDTO } from "../dto/BlockDTO";
import { DBHead } from "../db/DBHead";
import { DBBlock } from "../db/DBBlock";
import { CHECK } from "../rules/index";
import { RevocationDTO } from "../dto/RevocationDTO";
import { IdentityDTO } from "../dto/IdentityDTO";
import { CertificationDTO } from "../dto/CertificationDTO";
import { MembershipDTO } from "../dto/MembershipDTO";
import { TransactionDTO } from "../dto/TransactionDTO";
import { CommonConstants } from "../common-libs/constants";
import { FileDAL } from "../dal/fileDAL";
import { NewLogger } from "../logger";
import { DBTx } from "../db/DBTx";
import { Underscore } from "../common-libs/underscore";
import { OtherConstants } from "../other_constants";
import { MonitorExecutionTime } from "../debug/MonitorExecutionTime";
import { Wot } from "duniteroxyde";
import { Directory } from "../system/directory";

export class DuniterBlockchain {
  static async checkBlock(
    block: BlockDTO,
    withPoWAndSignature: boolean,
    conf: ConfDTO,
    dal: FileDAL
  ) {
    const index = Indexer.localIndex(block, conf);
    if (withPoWAndSignature) {
      await CHECK.ASYNC.ALL_LOCAL(block, conf, index);
    } else {
      await CHECK.ASYNC.ALL_LOCAL_BUT_POW(block, conf, index);
    }
    const HEAD = await Indexer.completeGlobalScope(block, conf, index, dal);
    const HEAD_1 = await dal.bindexDAL.head(1);
    const mindex = Indexer.mindex(index);
    const iindex = Indexer.iindex(index);
    const sindex = Indexer.sindex(index);
    const cindex = Indexer.cindex(index);
    // BR_G49
    if (Indexer.ruleVersion(HEAD, HEAD_1) === false) throw Error("ruleVersion");
    // BR_G50
    if (Indexer.ruleBlockSize(HEAD) === false) throw Error("ruleBlockSize");
    // BR_G98
    if (Indexer.ruleCurrency(block, HEAD) === false)
      throw Error("ruleCurrency");
    // BR_G51
    if (Indexer.ruleNumber(block, HEAD) === false) {
      throw Error("ruleNumber");
    }
    // BR_G52
    if (Indexer.rulePreviousHash(block, HEAD) === false)
      throw Error("rulePreviousHash");
    // BR_G53
    if (Indexer.rulePreviousIssuer(block, HEAD) === false)
      throw Error("rulePreviousIssuer");
    // BR_G101
    if (Indexer.ruleIssuerIsMember(HEAD) === false)
      throw Error("ruleIssuerIsMember");
    // BR_G54
    if (Indexer.ruleIssuersCount(block, HEAD) === false)
      throw Error("ruleIssuersCount");
    // BR_G55
    if (Indexer.ruleIssuersFrame(block, HEAD) === false)
      throw Error("ruleIssuersFrame");
    // BR_G56
    if (Indexer.ruleIssuersFrameVar(block, HEAD) === false)
      throw Error("ruleIssuersFrameVar");
    // BR_G57
    if (Indexer.ruleMedianTime(block, HEAD) === false) {
      throw Error("ruleMedianTime");
    }
    // BR_G58
    if (Indexer.ruleDividend(block, HEAD) === false)
      throw Error("ruleDividend");
    // BR_G59
    if (Indexer.ruleUnitBase(block, HEAD) === false)
      throw Error("ruleUnitBase");
    // BR_G60
    if (Indexer.ruleMembersCount(block, HEAD) === false)
      throw Error("ruleMembersCount");
    // BR_G61
    if (Indexer.rulePowMin(block, HEAD) === false) throw Error("rulePowMin");
    if (withPoWAndSignature) {
      // BR_G62
      if (Indexer.ruleProofOfWork(HEAD) === false)
        throw Error("ruleProofOfWork");
    }
    // BR_G63
    if (Indexer.ruleIdentityWritability(iindex, conf) === false)
      throw Error("ruleIdentityWritability");
    // BR_G64
    if (Indexer.ruleMembershipWritability(mindex, conf) === false)
      throw Error("ruleMembershipWritability");
    // BR_G108
    if (Indexer.ruleMembershipPeriod(mindex) === false)
      throw Error("ruleMembershipPeriod");
    // BR_G65
    if (Indexer.ruleCertificationWritability(cindex, conf) === false)
      throw Error("ruleCertificationWritability");
    // BR_G66
    if (Indexer.ruleCertificationStock(cindex, conf) === false)
      throw Error("ruleCertificationStock");
    // BR_G67
    if (Indexer.ruleCertificationPeriod(cindex) === false)
      throw Error("ruleCertificationPeriod");
    // BR_G68
    if (Indexer.ruleCertificationFromMember(HEAD, cindex) === false)
      throw Error("ruleCertificationFromMember");
    // BR_G69
    if (Indexer.ruleCertificationToMemberOrNewcomer(cindex) === false)
      throw Error("ruleCertificationToMemberOrNewcomer");
    // BR_G70
    if (Indexer.ruleCertificationToLeaver(cindex) === false)
      throw Error("ruleCertificationToLeaver");
    // BR_G71
    if (Indexer.ruleCertificationReplay(cindex) === false) {
      throw Error("ruleCertificationReplay");
    }
    // BR_G72
    if (Indexer.ruleCertificationSignature(cindex) === false)
      throw Error("ruleCertificationSignature");
    // BR_G73
    if (Indexer.ruleIdentityUIDUnicity(iindex) === false)
      throw Error("ruleIdentityUIDUnicity");
    // BR_G74
    if (Indexer.ruleIdentityPubkeyUnicity(iindex) === false)
      throw Error("ruleIdentityPubkeyUnicity");
    // BR_G75
    if (Indexer.ruleMembershipSuccession(mindex) === false)
      throw Error("ruleMembershipSuccession");
    // BR_G76
    if (Indexer.ruleMembershipDistance(HEAD, mindex) === false)
      throw Error("ruleMembershipDistance");
    // BR_G77
    if (Indexer.ruleMembershipOnRevoked(mindex) === false)
      throw Error("ruleMembershipOnRevoked");
    // BR_G78
    if (Indexer.ruleMembershipJoinsTwice(mindex) === false)
      throw Error("ruleMembershipJoinsTwice");
    // BR_G79
    if (Indexer.ruleMembershipEnoughCerts(mindex) === false)
      throw Error("ruleMembershipEnoughCerts");
    // BR_G80
    if (Indexer.ruleMembershipLeaverIsMember(mindex) === false)
      throw Error("ruleMembershipLeaverIsMember");
    // BR_G81
    if (Indexer.ruleMembershipActiveIsMember(mindex) === false) {
      throw Error("ruleMembershipActiveIsMember");
    }
    // BR_G82
    if (Indexer.ruleMembershipRevokedIsMember(mindex) === false)
      throw Error("ruleMembershipRevokedIsMember");
    // BR_G83
    if (Indexer.ruleMembershipRevokedSingleton(mindex) === false)
      throw Error("ruleMembershipRevokedSingleton");
    // BR_G84
    if (Indexer.ruleMembershipRevocationSignature(mindex) === false)
      throw Error("ruleMembershipRevocationSignature");
    // BR_G85
    if (Indexer.ruleMembershipExcludedIsMember(iindex) === false)
      throw Error("ruleMembershipExcludedIsMember");
    // BR_G86
    if ((await Indexer.ruleToBeKickedArePresent(iindex, dal)) === false) {
      throw Error("ruleToBeKickedArePresent");
    }
    // BR_G103
    if (Indexer.ruleTxWritability(sindex) === false)
      throw Error("ruleTxWritability");
    // BR_G87
    if (Indexer.ruleInputIsAvailable(sindex) === false)
      throw Error("ruleInputIsAvailable");
    // BR_G88
    if (Indexer.ruleInputIsUnlocked(sindex) === false)
      throw Error("ruleInputIsUnlocked");
    // BR_G89
    if (Indexer.ruleInputIsTimeUnlocked(sindex) === false)
      throw Error("ruleInputIsTimeUnlocked");
    // BR_G90
    if (Indexer.ruleOutputBase(sindex, HEAD_1) === false)
      throw Error("ruleOutputBase");
    // Check document's coherence

    const matchesList = (regexp: RegExp, list: string[]) => {
      let i = 0;
      let found = "";
      while (!found && i < list.length) {
        found = list[i].match(regexp) ? list[i] : "";
        i++;
      }
      return found;
    };

    const isMember = await dal.isMember(block.issuer);
    if (!isMember) {
      if (block.number == 0) {
        if (!matchesList(new RegExp("^" + block.issuer + ":"), block.joiners)) {
          throw Error("Block not signed by the root members");
        }
      } else {
        throw Error("Block must be signed by an existing member");
      }
    }

    // Generate the local index
    // Check the local rules
    // Enrich with the global index
    // Check the global rules
    return { index, HEAD };
  }

  static async pushTheBlock(
    obj: BlockDTO,
    index: IndexEntry[],
    HEAD: DBHead | null,
    conf: ConfDTO,
    dal: FileDAL,
    logger: any,
    trim = true
  ) {
    const start = Date.now();
    const block = BlockDTO.fromJSONObject(obj);
    try {
      const currentBlock = await dal.getCurrentBlockOrNull();
      block.fork = false;
      const added = await this.saveBlockData(
        currentBlock,
        block,
        conf,
        dal,
        logger,
        index,
        HEAD,
        trim
      );

      logger.info(
        "Block #" + block.number + " added to the blockchain in %s ms",
        Date.now() - start
      );

      return BlockDTO.fromJSONObject(added);
    } catch (err) {
      throw err;
    }

    // Enrich the index with post-HEAD indexes
    // Push the block into the blockchain
    // await supra.pushBlock(b)
    // await supra.recordIndex(index)
  }

  static async saveBlockData(
    current: DBBlock | null,
    block: BlockDTO,
    conf: ConfDTO,
    dal: FileDAL,
    logger: any,
    index: IndexEntry[],
    HEAD: DBHead | null,
    trim: boolean
  ) {
    if (block.number == 0) {
      await this.saveParametersForRoot(block, conf, dal);
    }

    const indexes = await dal.generateIndexes(block, conf, index, HEAD);

    // Newcomers
    await this.createNewcomers(indexes.iindex, dal, logger);

    // Save indexes
    await dal.bindexDAL.insert(indexes.HEAD);
    await dal.flushIndexes(indexes);

    // Create/Update nodes in wotb
    await this.updateMembers(block, dal);

    // Update the wallets' blances
    await this.updateWallets(indexes.sindex, indexes.dividends, dal);

    if (trim) {
      await DuniterBlockchain.trimIndexes(dal, indexes.HEAD, conf);
    }

    const dbb = DBBlock.fromBlockDTO(block);
    this.updateBlocksComputedVars(current, dbb);

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

    // Save wot file
    if (!dal.fs.isMemoryOnly()) {
      let wotbFilepath = await Directory.getWotbFilePath(dal.rootPath);
      dal.wotb.writeInFile(wotbFilepath);
    }

    return dbb;
  }

  static async saveParametersForRoot(
    block: BlockDTO,
    conf: ConfDTO,
    dal: FileDAL
  ) {
    if (block.parameters) {
      const bconf = BlockDTO.getConf(block);
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

  @MonitorExecutionTime()
  static async createNewcomers(
    iindex: IindexEntry[],
    dal: FileDAL,
    logger: any,
    instance?: Wot
  ) {
    const wotb = instance || dal.wotb;
    for (const i of iindex) {
      if (i.op == CommonConstants.IDX_CREATE) {
        const entry = i as FullIindexEntry;
        // Reserves a wotb ID
        entry.wotb_id = wotb.addNode();
        logger.trace("%s was affected wotb_id %s", entry.uid, entry.wotb_id);
        // Remove from the sandbox any other identity with the same pubkey/uid, since it has now been reserved.
        await dal.removeUnWrittenWithPubkey(entry.pub);
        await dal.removeUnWrittenWithUID(entry.uid);
      }
    }
  }

  static async updateMembers(block: BlockDTO, dal: FileDAL, instance?: Wot) {
    const wotb = instance || dal.wotb;
    // Joiners (come back)
    for (const inlineMS of block.joiners) {
      let ms = MembershipDTO.fromInline(inlineMS);
      const idty = await dal.getWrittenIdtyByPubkeyForWotbID(ms.issuer);
      wotb.setEnabled(true, idty.wotb_id);
      await dal.dividendDAL.setMember(true, ms.issuer);
    }
    // Revoked
    for (const inlineRevocation of block.revoked) {
      let revocation = RevocationDTO.fromInline(inlineRevocation);
      await dal.revokeIdentity(revocation.pubkey);
    }
    // Excluded
    for (const excluded of block.excluded) {
      const idty = await dal.getWrittenIdtyByPubkeyForWotbID(excluded);
      wotb.setEnabled(false, idty.wotb_id);
      await dal.dividendDAL.setMember(false, excluded);
    }
  }

  static async updateWallets(
    sindex: SimpleSindexEntryForWallet[],
    dividends: SimpleUdEntryForWallet[],
    aDal: any,
    reverse = false,
    at?: number
  ) {
    const differentConditions = Underscore.uniq(
      sindex
        .map((entry) => entry.conditions)
        .concat(dividends.map((d) => d.conditions))
    );
    for (const conditions of differentConditions) {
      const udsOfKey: BasedAmount[] = dividends
        .filter((d) => d.conditions === conditions)
        .map((d) => ({ amount: d.amount, base: d.base }));
      const creates: BasedAmount[] = sindex.filter(
        (entry) =>
          entry.conditions === conditions &&
          entry.op === CommonConstants.IDX_CREATE
      );
      const updates: BasedAmount[] = sindex.filter(
        (entry) =>
          entry.conditions === conditions &&
          entry.op === CommonConstants.IDX_UPDATE
      );
      const positives = creates
        .concat(udsOfKey)
        .reduce((sum, src) => sum + src.amount * Math.pow(10, src.base), 0);
      const negatives = updates.reduce(
        (sum, src) => sum + src.amount * Math.pow(10, src.base),
        0
      );
      const wallet = await aDal.getWallet(conditions);
      let variation = positives - negatives;
      if (reverse) {
        // To do the opposite operations, for a reverted block
        variation *= -1;
      }
      if (OtherConstants.TRACE_BALANCES) {
        if (
          !OtherConstants.TRACE_PARTICULAR_BALANCE ||
          wallet.conditions.match(
            new RegExp(OtherConstants.TRACE_PARTICULAR_BALANCE)
          )
        ) {
          NewLogger().trace(
            "Balance of %s: %s (%s %s %s) at #%s",
            wallet.conditions,
            wallet.balance + variation,
            wallet.balance,
            variation < 0 ? "-" : "+",
            Math.abs(variation),
            at
          );
        }
      }
      wallet.balance += variation;
      if (
        OtherConstants.TRACE_PARTICULAR_BALANCE &&
        wallet.conditions.match(
          new RegExp(OtherConstants.TRACE_PARTICULAR_BALANCE)
        )
      ) {
        NewLogger().trace(
          ">>>>>>>>> WALLET = ",
          (wallet.balance > 0 ? "+" : "") + wallet.balance
        );
      }
      await aDal.saveWallet(wallet);
    }
  }

  static async revertBlock(
    number: number,
    hash: string,
    dal: FileDAL,
    block?: DBBlock
  ) {
    const blockstamp = [number, hash].join("-");

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
    const REVERSE_BALANCE = true;
    const sindexOfBlock = await dal.sindexDAL.getWrittenOnTxs(blockstamp);

    await dal.bindexDAL.removeBlock(blockstamp);
    await dal.mindexDAL.removeBlock(blockstamp);
    await dal.iindexDAL.removeBlock(blockstamp);
    await dal.cindexDAL.removeBlock(blockstamp);
    await dal.sindexDAL.removeBlock(blockstamp);
    const {
      createdUDsDestroyedByRevert,
      consumedUDsRecoveredByRevert,
    } = await dal.dividendDAL.revertUDs(number);

    // Then: normal updates
    const previousBlock = await dal.getFullBlockOf(number - 1);
    // Set the block as SIDE block (equivalent to removal from main branch)
    await dal.blockDAL.setSideBlock(number, previousBlock);

    // Update the dividends in our wallet
    await this.updateWallets(
      [],
      createdUDsDestroyedByRevert,
      dal,
      REVERSE_BALANCE
    );
    await this.updateWallets([], consumedUDsRecoveredByRevert, dal);
    // Revert the balances variations for this block
    await this.updateWallets(sindexOfBlock, [], dal, REVERSE_BALANCE);

    // Restore block's transaction as incoming transactions
    if (block) {
      await this.undoDeleteTransactions(block, dal);
    }
  }

  static async undoMembersUpdate(blockstamp: string, dal: FileDAL) {
    const joiners = await dal.iindexDAL.getWrittenOn(blockstamp);
    for (const entry of joiners) {
      // Undo 'join' which can be either newcomers or comebackers
      // => equivalent to i_index.member = true AND i_index.op = 'UPDATE'
      if (entry.member === true && entry.op === CommonConstants.IDX_UPDATE) {
        const idty = await dal.getWrittenIdtyByPubkeyForWotbID(entry.pub);
        dal.wotb.setEnabled(false, idty.wotb_id);
        await dal.dividendDAL.setMember(false, entry.pub);
      }
    }
    const newcomers = await dal.iindexDAL.getWrittenOn(blockstamp);
    for (const entry of newcomers) {
      // Undo newcomers
      // => equivalent to i_index.op = 'CREATE'
      if (entry.op === CommonConstants.IDX_CREATE) {
        // Does not matter which one it really was, we pop the last X identities
        NewLogger().trace("removeNode");
        if (dal.wotb.getWoTSize() > 0) {
          dal.wotb.removeNode();
        }
        await dal.dividendDAL.deleteMember(entry.pub);
      }
    }
    const excluded = await dal.iindexDAL.getWrittenOn(blockstamp);
    for (const entry of excluded) {
      // Undo excluded (make them become members again in wotb)
      // => equivalent to m_index.member = false
      if (entry.member === false && entry.op === CommonConstants.IDX_UPDATE) {
        const idty = await dal.getWrittenIdtyByPubkeyForWotbID(entry.pub);
        dal.wotb.setEnabled(true, idty.wotb_id);
        await dal.dividendDAL.setMember(true, entry.pub);
      }
    }
  }

  static async undoDeleteTransactions(block: DBBlock, dal: FileDAL) {
    for (const obj of block.transactions) {
      obj.currency = block.currency;
      let tx = TransactionDTO.fromJSONObject(obj);
      await dal.saveTransaction(DBTx.fromTransactionDTO(tx));
    }
  }

  /**
   * Delete certifications from the sandbox since it has been written.
   *
   * @param block Block in which are contained the certifications to remove from sandbox.
   * @param dal The DAL
   */
  static async removeCertificationsFromSandbox(block: BlockDTO, dal: FileDAL) {
    for (let inlineCert of block.certifications) {
      let cert = CertificationDTO.fromInline(inlineCert);
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
  static async removeMembershipsFromSandbox(block: BlockDTO, dal: FileDAL) {
    const mss = block.joiners.concat(block.actives).concat(block.leavers);
    for (const inlineMS of mss) {
      let ms = MembershipDTO.fromInline(inlineMS);
      await dal.deleteMS({
        issuer: ms.issuer,
        signature: ms.signature,
      });
    }
  }

  static async computeToBeRevoked(mindex: MindexEntry[], dal: FileDAL) {
    const revocations = Underscore.filter(
      mindex,
      (entry: MindexEntry) => !!entry.revoked_on
    );
    for (const revoked of revocations) {
      await dal.setRevoked(revoked.pub);
    }
  }

  static async deleteTransactions(block: BlockDTO, dal: FileDAL) {
    for (const obj of block.transactions) {
      obj.currency = block.currency;
      const tx = TransactionDTO.fromJSONObject(obj);
      const txHash = tx.getHash();
      await dal.removeTxByHash(txHash);
    }
  }

  static updateBlocksComputedVars(
    current: { unitbase: number; monetaryMass: number } | null,
    block: {
      number: number;
      unitbase: number;
      dividend: number | null;
      membersCount: number;
      monetaryMass: number;
    }
  ): void {
    // Unit Base
    block.unitbase =
      (block.dividend && block.unitbase) || (current && current.unitbase) || 0;
    // Monetary Mass update
    if (current) {
      block.monetaryMass =
        (current.monetaryMass || 0) +
        (block.dividend || 0) *
          Math.pow(10, block.unitbase || 0) *
          block.membersCount;
    } else {
      block.monetaryMass = 0;
    }
    // UD Time update
    if (block.number == 0) {
      block.dividend = null;
    } else if (!block.dividend) {
      block.dividend = null;
    }
  }

  static async pushSideBlock(obj: BlockDTO, dal: FileDAL, logger: any) {
    const start = Date.now();
    const block = DBBlock.fromBlockDTO(BlockDTO.fromJSONObject(obj));
    block.fork = true;
    try {
      // Saves the block (DAL)
      block.wrong = false;
      await dal.saveSideBlockInFile(block);
      logger.info(
        "SIDE Block #%s-%s added to the blockchain in %s ms",
        block.number,
        block.hash.substr(0, 8),
        Date.now() - start
      );
      return block;
    } catch (err) {
      throw err;
    }
  }

  public static async trimIndexes(
    dal: FileDAL,
    HEAD: { number: number },
    conf: ConfDTO
  ) {
    const TAIL = await dal.bindexDAL.tail();
    const MAX_BINDEX_SIZE = requiredBindexSizeForTail(TAIL, conf);
    const currentSize = HEAD.number - TAIL.number + 1;
    if (currentSize > MAX_BINDEX_SIZE) {
      await dal.trimIndexes(HEAD.number - MAX_BINDEX_SIZE);
    }
  }
}

export function requiredBindexSizeForTail(
  TAIL: { issuersCount: number; issuersFrame: number },
  conf: { medianTimeBlocks: number; dtDiffEval: number; forksize: number }
) {
  const bindexSize = [
    TAIL.issuersCount,
    TAIL.issuersFrame,
    conf.medianTimeBlocks,
    conf.dtDiffEval,
  ].reduce((max, value) => {
    return Math.max(max, value);
  }, 0);
  return conf.forksize + bindexSize;
}
