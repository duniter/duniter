import {MiscIndexedBlockchain} from "./MiscIndexedBlockchain"
import {IindexEntry, IndexEntry, Indexer, MindexEntry, SindexEntry} from "../indexer"
import {BlockchainOperator} from "./interfaces/BlockchainOperator"
import {ConfDTO} from "../dto/ConfDTO"
import {BlockDTO} from "../dto/BlockDTO"
import {DBHead} from "../db/DBHead"
import {DBBlock} from "../db/DBBlock"

const _ = require('underscore')
const rules = require('../rules')
const common          = require('duniter-common')
const Block           = require('../entity/block')
const Identity        = require('../entity/identity')
const Certification   = require('../entity/certification')
const Membership      = require('../entity/membership')
const Transaction     = require('../entity/transaction')

export class DuniterBlockchain extends MiscIndexedBlockchain {

  constructor(blockchainStorage:BlockchainOperator, dal:any) {
    super(blockchainStorage, dal.mindexDAL, dal.iindexDAL, dal.sindexDAL, dal.cindexDAL)
  }

  async checkBlock(block:BlockDTO, withPoWAndSignature:boolean, conf: ConfDTO, dal:any) {
    const index = Indexer.localIndex(block, conf)
    if (withPoWAndSignature) {
      await rules.CHECK.ASYNC.ALL_LOCAL(block, conf, index)
    }
    else {
      await rules.CHECK.ASYNC.ALL_LOCAL_BUT_POW(block, conf, index)
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
    if (Indexer.ruleMedianTime(block, HEAD) === false) throw Error('ruleMedianTime');
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

  async pushTheBlock(obj:BlockDTO, index:IndexEntry[], HEAD:DBHead | null, conf:ConfDTO, dal:any, logger:any) {
    const start = Date.now();
    const block = new Block(obj);
    try {
      const currentBlock = await dal.getCurrentBlockOrNull();
      block.fork = false;
      await this.saveBlockData(currentBlock, block, conf, dal, logger, index, HEAD);

      try {
        await DuniterBlockchain.pushStatsForBlocks([block], dal);
      } catch (e) {
        logger.warn("An error occurred after the add of the block", e.stack || e);
      }

      logger.info('Block #' + block.number + ' added to the blockchain in %s ms', (Date.now() - start));
      return block;
    }
    catch(err) {
      throw err;
    }

    // Enrich the index with post-HEAD indexes
    // Push the block into the blockchain
    // await supra.pushBlock(b)
    // await supra.recordIndex(index)
  }

  async saveBlockData(current:DBBlock, block:BlockDTO, conf:ConfDTO, dal:any, logger:any, index:IndexEntry[], HEAD:DBHead | null) {
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
      block.issuersCount,
      block.issuersFrame,
      conf.medianTimeBlocks,
      conf.dtDiffEval
    ].reduce((max, value) => {
      return Math.max(max, value);
    }, 0);
    const MAX_BINDEX_SIZE = 2 * bindexSize;
    const currentSize = indexes.HEAD.number - TAIL.number + 1;
    if (currentSize > MAX_BINDEX_SIZE) {
      await dal.trimIndexes(indexes.HEAD.number - MAX_BINDEX_SIZE);
    }

    const dbb = DBBlock.fromBlockDTO(block)
    await this.updateBlocksComputedVars(current, dbb);
    // Saves the block (DAL)
    await dal.saveBlock(dbb);

    // --> Update links
    await dal.updateWotbLinks(indexes.cindex);

    // Create/Update certifications
    await this.removeCertificationsFromSandbox(block, dal);
    // Create/Update memberships
    await this.removeMembershipsFromSandbox(block, dal);
    // Compute to be revoked members
    await this.computeToBeRevoked(indexes.mindex, dal);
    // Delete eventually present transactions
    await this.deleteTransactions(block, dal);

    await dal.trimSandboxes(block);

    return block;
  }

  async saveParametersForRoot(block:BlockDTO, conf:ConfDTO, dal:any) {
    if (block.parameters) {
      const bconf = Block.statics.getConf(block);
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
      conf.currency = block.currency;
      // Super important: adapt wotb module to handle the correct stock
      dal.wotb.setMaxCert(conf.sigStock);
      return dal.saveConf(conf);
    }
  }

  async createNewcomers(iindex:IindexEntry[], dal:any, logger:any) {
    for (const entry of iindex) {
      if (entry.op == common.constants.IDX_CREATE) {
        // Reserves a wotb ID
        entry.wotb_id = dal.wotb.addNode();
        logger.trace('%s was affected wotb_id %s', entry.uid, entry.wotb_id);
        // Remove from the sandbox any other identity with the same pubkey/uid, since it has now been reserved.
        await dal.removeUnWrittenWithPubkey(entry.pub)
        await dal.removeUnWrittenWithUID(entry.uid)
      }
    }
  }

  async updateMembers(block:BlockDTO, dal:any) {
    // Joiners (come back)
    for (const inlineMS of block.joiners) {
      let ms = Membership.statics.fromInline(inlineMS);
      const idty = await dal.getWrittenIdtyByPubkey(ms.issuer);
      dal.wotb.setEnabled(true, idty.wotb_id);
    }
    // Revoked
    for (const inlineRevocation of block.revoked) {
      let revocation = Identity.statics.revocationFromInline(inlineRevocation);
      await dal.revokeIdentity(revocation.pubkey, block.number);
    }
    // Excluded
    for (const excluded of block.excluded) {
      const idty = await dal.getWrittenIdtyByPubkey(excluded);
      dal.wotb.setEnabled(false, idty.wotb_id);
    }
  }

  async updateWallets(sindex:SindexEntry[], aDal:any, reverse = false) {
    const differentConditions = _.uniq(sindex.map((entry) => entry.conditions))
    for (const conditions of differentConditions) {
      const creates = _.filter(sindex, (entry:SindexEntry) => entry.conditions === conditions && entry.op === common.constants.IDX_CREATE)
      const updates = _.filter(sindex, (entry:SindexEntry) => entry.conditions === conditions && entry.op === common.constants.IDX_UPDATE)
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

  async revertBlock(number:number, hash:string, dal:any) {

    const blockstamp = [number, hash].join('-');

    // Revert links
    const writtenOn = await dal.cindexDAL.getWrittenOn(blockstamp);
    for (const entry of writtenOn) {
      const from = await dal.getWrittenIdtyByPubkey(entry.issuer);
      const to = await dal.getWrittenIdtyByPubkey(entry.receiver);
      if (entry.op == common.constants.IDX_CREATE) {
        // We remove the created link
        dal.wotb.removeLink(from.wotb_id, to.wotb_id, true);
      } else {
        // We add the removed link
        dal.wotb.addLink(from.wotb_id, to.wotb_id, true);
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
    const block = await dal.getBlockByBlockstampOrNull(blockstamp);
    const previousBlock = await dal.getBlock(number - 1);
    // Set the block as SIDE block (equivalent to removal from main branch)
    await dal.blockDAL.setSideBlock(number, previousBlock);

    // Revert the balances variations for this block
    await this.updateWallets(sindexOfBlock, dal, REVERSE_BALANCE)

    // Restore block's transaction as incoming transactions
    await this.undoDeleteTransactions(block, dal)
  }

  async undoMembersUpdate(blockstamp:string, dal:any) {
    const joiners = await dal.iindexDAL.getWrittenOn(blockstamp);
    for (const entry of joiners) {
      // Undo 'join' which can be either newcomers or comebackers
      // => equivalent to i_index.member = true AND i_index.op = 'UPDATE'
      if (entry.member === true && entry.op === common.constants.IDX_UPDATE) {
        const idty = await dal.getWrittenIdtyByPubkey(entry.pub);
        dal.wotb.setEnabled(false, idty.wotb_id);
      }
    }
    const newcomers = await dal.iindexDAL.getWrittenOn(blockstamp);
    for (const entry of newcomers) {
      // Undo newcomers
      // => equivalent to i_index.op = 'CREATE'
      if (entry.op === common.constants.IDX_CREATE) {
        // Does not matter which one it really was, we pop the last X identities
        dal.wotb.removeNode();
      }
    }
    const excluded = await dal.iindexDAL.getWrittenOn(blockstamp);
    for (const entry of excluded) {
      // Undo excluded (make them become members again in wotb)
      // => equivalent to m_index.member = false
      if (entry.member === false && entry.op === common.constants.IDX_UPDATE) {
        const idty = await dal.getWrittenIdtyByPubkey(entry.pub);
        dal.wotb.setEnabled(true, idty.wotb_id);
      }
    }
  }

  async undoDeleteTransactions(block:BlockDTO, dal:any) {
    for (const obj of block.transactions) {
      obj.currency = block.currency;
      let tx = new Transaction(obj);
      await dal.saveTransaction(tx);
    }
  }

  /**
   * Delete certifications from the sandbox since it has been written.
   *
   * @param block Block in which are contained the certifications to remove from sandbox.
   * @param dal The DAL
   */
  async removeCertificationsFromSandbox(block:BlockDTO, dal:any) {
    for (let inlineCert of block.certifications) {
      let cert = Certification.statics.fromInline(inlineCert);
      let idty = await dal.getWritten(cert.to);
      cert.target = new Identity(idty).getTargetHash();
      await dal.deleteCert(cert);
    }
  }

  /**
   * Delete memberships from the sandbox since it has been written.
   *
   * @param block Block in which are contained the certifications to remove from sandbox.
   * @param dal The DAL
   */
  async removeMembershipsFromSandbox(block:BlockDTO, dal:any) {
    const mss = block.joiners.concat(block.actives).concat(block.leavers);
    for (const inlineMS of mss) {
      let ms = Membership.statics.fromInline(inlineMS);
      await dal.deleteMS(ms);
    }
  }

  async computeToBeRevoked(mindex:MindexEntry[], dal:any) {
    const revocations = _.filter(mindex, (entry:MindexEntry) => entry.revoked_on);
    for (const revoked of revocations) {
      await dal.setRevoked(revoked.pub, true);
    }
  }

  async deleteTransactions(block:BlockDTO, dal:any) {
    for (const obj of block.transactions) {
      obj.currency = block.currency;
      const tx = new Transaction(obj);
      const txHash = tx.getHash();
      await dal.removeTxByHash(txHash);
    }
  }

  updateBlocksComputedVars(current:DBBlock, block:DBBlock): Promise<void> {
    // Unit Base
    block.unitbase = (block.dividend && block.unitbase) || (current && current.unitbase) || 0;
    // Monetary Mass update
    if (current) {
      block.monetaryMass = (current.monetaryMass || 0)
        + (block.dividend || 0) * Math.pow(10, block.unitbase || 0) * block.membersCount;
    }
    // UD Time update
    if (block.number == 0) {
      block.dividend = null;
    }
    else if (!block.dividend) {
      block.dividend = null;
    }
    return Promise.resolve()
  }

  static pushStatsForBlocks(blocks:BlockDTO[], dal:any) {
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

  async pushSideBlock(obj:BlockDTO, dal:any, logger:any) {
    const start = Date.now();
    const block = new Block(obj);
    block.fork = true;
    try {
      // Saves the block (DAL)
      block.wrong = false;
      await dal.saveSideBlockInFile(block);
      logger.info('SIDE Block #' + block.number + ' added to the blockchain in %s ms', (Date.now() - start));
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
