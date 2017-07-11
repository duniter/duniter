"use strict"

const _ = require('underscore')
const Q = require('q')
const co = require('co')
const rules = require('../rules')
const indexer = require('../indexer')
const common          = require('duniter-common')
const Block           = require('../entity/block')
const Identity        = require('../entity/identity')
const Certification   = require('../entity/certification')
const Membership      = require('../entity/membership')
const Transaction     = require('../entity/transaction')
const MiscIndexedBlockchain = require('./miscIndexedBlockchain')

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

module.exports = class DuniterBlockchain extends MiscIndexedBlockchain {

  constructor(blockchainStorage, dal) {
    super(blockchainStorage, dal.mindexDAL, dal.iindexDAL, dal.sindexDAL, dal.cindexDAL)
  }

  checkBlock(block, withPoWAndSignature, conf, dal) {
    return co(function*() {
      const index = indexer.localIndex(block, conf)
      if (withPoWAndSignature) {
        yield Q.nbind(rules.CHECK.ASYNC.ALL_LOCAL, rules, block, conf, index);
      }
      else {
        yield Q.nbind(rules.CHECK.ASYNC.ALL_LOCAL_BUT_POW, rules, block, conf, index);
      }
      const HEAD = yield indexer.completeGlobalScope(block, conf, index, dal);
      const HEAD_1 = yield dal.bindexDAL.head(1);
      const mindex = indexer.mindex(index);
      const iindex = indexer.iindex(index);
      const sindex = indexer.sindex(index);
      const cindex = indexer.cindex(index);
      // BR_G49
      if (indexer.ruleVersion(HEAD, HEAD_1) === false) throw Error('ruleVersion');
      // BR_G50
      if (indexer.ruleBlockSize(HEAD) === false) throw Error('ruleBlockSize');
      // BR_G98
      if (indexer.ruleCurrency(block, HEAD) === false) throw Error('ruleCurrency');
      // BR_G51
      if (indexer.ruleNumber(block, HEAD) === false) throw Error('ruleNumber');
      // BR_G52
      if (indexer.rulePreviousHash(block, HEAD) === false) throw Error('rulePreviousHash');
      // BR_G53
      if (indexer.rulePreviousIssuer(block, HEAD) === false) throw Error('rulePreviousIssuer');
      // BR_G101
      if (indexer.ruleIssuerIsMember(HEAD) === false) throw Error('ruleIssuerIsMember');
      // BR_G54
      if (indexer.ruleIssuersCount(block, HEAD) === false) throw Error('ruleIssuersCount');
      // BR_G55
      if (indexer.ruleIssuersFrame(block, HEAD) === false) throw Error('ruleIssuersFrame');
      // BR_G56
      if (indexer.ruleIssuersFrameVar(block, HEAD) === false) throw Error('ruleIssuersFrameVar');
      // BR_G57
      if (indexer.ruleMedianTime(block, HEAD) === false) throw Error('ruleMedianTime');
      // BR_G58
      if (indexer.ruleDividend(block, HEAD) === false) throw Error('ruleDividend');
      // BR_G59
      if (indexer.ruleUnitBase(block, HEAD) === false) throw Error('ruleUnitBase');
      // BR_G60
      if (indexer.ruleMembersCount(block, HEAD) === false) throw Error('ruleMembersCount');
      // BR_G61
      if (indexer.rulePowMin(block, HEAD) === false) throw Error('rulePowMin');
      if (withPoWAndSignature) {
        // BR_G62
        if (indexer.ruleProofOfWork(HEAD) === false) throw Error('ruleProofOfWork');
      }
      // BR_G63
      if (indexer.ruleIdentityWritability(iindex, conf) === false) throw Error('ruleIdentityWritability');
      // BR_G64
      if (indexer.ruleMembershipWritability(mindex, conf) === false) throw Error('ruleMembershipWritability');
      // BR_G108
      if (indexer.ruleMembershipPeriod(mindex) === false) throw Error('ruleMembershipPeriod');
      // BR_G65
      if (indexer.ruleCertificationWritability(cindex, conf) === false) throw Error('ruleCertificationWritability');
      // BR_G66
      if (indexer.ruleCertificationStock(cindex, conf) === false) throw Error('ruleCertificationStock');
      // BR_G67
      if (indexer.ruleCertificationPeriod(cindex) === false) throw Error('ruleCertificationPeriod');
      // BR_G68
      if (indexer.ruleCertificationFromMember(HEAD, cindex) === false) throw Error('ruleCertificationFromMember');
      // BR_G69
      if (indexer.ruleCertificationToMemberOrNewcomer(cindex) === false) throw Error('ruleCertificationToMemberOrNewcomer');
      // BR_G70
      if (indexer.ruleCertificationToLeaver(cindex) === false) throw Error('ruleCertificationToLeaver');
      // BR_G71
      if (indexer.ruleCertificationReplay(cindex) === false) throw Error('ruleCertificationReplay');
      // BR_G72
      if (indexer.ruleCertificationSignature(cindex) === false) throw Error('ruleCertificationSignature');
      // BR_G73
      if (indexer.ruleIdentityUIDUnicity(iindex) === false) throw Error('ruleIdentityUIDUnicity');
      // BR_G74
      if (indexer.ruleIdentityPubkeyUnicity(iindex) === false) throw Error('ruleIdentityPubkeyUnicity');
      // BR_G75
      if (indexer.ruleMembershipSuccession(mindex) === false) throw Error('ruleMembershipSuccession');
      // BR_G76
      if (indexer.ruleMembershipDistance(HEAD, mindex) === false) throw Error('ruleMembershipDistance');
      // BR_G77
      if (indexer.ruleMembershipOnRevoked(mindex) === false) throw Error('ruleMembershipOnRevoked');
      // BR_G78
      if (indexer.ruleMembershipJoinsTwice(mindex) === false) throw Error('ruleMembershipJoinsTwice');
      // BR_G79
      if (indexer.ruleMembershipEnoughCerts(mindex) === false) throw Error('ruleMembershipEnoughCerts');
      // BR_G80
      if (indexer.ruleMembershipLeaverIsMember(mindex) === false) throw Error('ruleMembershipLeaverIsMember');
      // BR_G81
      if (indexer.ruleMembershipActiveIsMember(mindex) === false) throw Error('ruleMembershipActiveIsMember');
      // BR_G82
      if (indexer.ruleMembershipRevokedIsMember(mindex) === false) throw Error('ruleMembershipRevokedIsMember');
      // BR_G83
      if (indexer.ruleMembershipRevokedSingleton(mindex) === false) throw Error('ruleMembershipRevokedSingleton');
      // BR_G84
      if (indexer.ruleMembershipRevocationSignature(mindex) === false) throw Error('ruleMembershipRevocationSignature');
      // BR_G85
      if (indexer.ruleMembershipExcludedIsMember(iindex) === false) throw Error('ruleMembershipExcludedIsMember');
      // BR_G86
      if ((yield indexer.ruleToBeKickedArePresent(iindex, dal)) === false) throw Error('ruleToBeKickedArePresent');
      // BR_G103
      if (indexer.ruleTxWritability(sindex) === false) throw Error('ruleTxWritability');
      // BR_G87
      if (indexer.ruleInputIsAvailable(sindex) === false) throw Error('ruleInputIsAvailable');
      // BR_G88
      if (indexer.ruleInputIsUnlocked(sindex) === false) throw Error('ruleInputIsUnlocked');
      // BR_G89
      if (indexer.ruleInputIsTimeUnlocked(sindex) === false) throw Error('ruleInputIsTimeUnlocked');
      // BR_G90
      if (indexer.ruleOutputBase(sindex, HEAD_1) === false) throw Error('ruleOutputBase');
      // Check document's coherence

      const matchesList = (regexp, list) => {
        let i = 0;
        let found = "";
        while (!found && i < list.length) {
          found = list[i].match(regexp) ? list[i] : "";
          i++;
        }
        return found;
      }

      const isMember = yield dal.isMember(block.issuer);
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
    })
  }

  pushBlock(obj, index, HEAD, conf, dal, logger) {
    // const supra = super
    const that = this
    return co(function*() {


      const start = new Date();
      const block = new Block(obj);
      try {
        const currentBlock = yield dal.getCurrentBlockOrNull();
        block.fork = false;
        yield that.saveBlockData(currentBlock, block, conf, dal, logger, index, HEAD);

        try {
          yield DuniterBlockchain.pushStatsForBlocks([block], dal);
        } catch (e) {
          logger.warn("An error occurred after the add of the block", e.stack || e);
        }

        logger.info('Block #' + block.number + ' added to the blockchain in %s ms', (new Date() - start));
        return block;
      }
      catch(err) {
        throw err;
      }

      // Enrich the index with post-HEAD indexes
      // Push the block into the blockchain
      // yield supra.pushBlock(b)
      // yield supra.recordIndex(index)
    })
  }

  saveBlockData(current, block, conf, dal, logger, index, HEAD) {
    const that = this
    return co(function*() {
      if (block.number == 0) {
        yield that.saveParametersForRoot(block, conf, dal);
      }

      const indexes = yield dal.generateIndexes(block, conf, index, HEAD);

      // Newcomers
      yield that.createNewcomers(indexes.iindex, dal, logger);

      // Save indexes
      yield dal.bindexDAL.saveEntity(indexes.HEAD);
      yield dal.mindexDAL.insertBatch(indexes.mindex);
      yield dal.iindexDAL.insertBatch(indexes.iindex);
      yield dal.sindexDAL.insertBatch(indexes.sindex);
      yield dal.cindexDAL.insertBatch(indexes.cindex);

      // Create/Update nodes in wotb
      yield that.updateMembers(block, dal);

      // Update the wallets' blances
      yield that.updateWallets(indexes.sindex, dal)

      const TAIL = yield dal.bindexDAL.tail();
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
        yield dal.trimIndexes(indexes.HEAD.number - MAX_BINDEX_SIZE);
      }

      yield that.updateBlocksComputedVars(current, block);
      // Saves the block (DAL)
      yield dal.saveBlock(block);

      // --> Update links
      yield dal.updateWotbLinks(indexes.cindex);

      // Create/Update certifications
      yield that.removeCertificationsFromSandbox(block, dal);
      // Create/Update memberships
      yield that.removeMembershipsFromSandbox(block, dal);
      // Compute to be revoked members
      yield that.computeToBeRevoked(indexes.mindex, dal);
      // Delete eventually present transactions
      yield that.deleteTransactions(block, dal);

      yield dal.trimSandboxes(block);

      return block;
    })
  }

  saveParametersForRoot(block, conf, dal) {
    return co(function*() {
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
    })
  }

  createNewcomers(iindex, dal, logger) {
    const that = this
    return co(function*() {
      for (const entry of iindex) {
        if (entry.op == common.constants.IDX_CREATE) {
          // Reserves a wotb ID
          entry.wotb_id = dal.wotb.addNode();
          logger.trace('%s was affected wotb_id %s', entry.uid, entry.wotb_id);
          // Remove from the sandbox any other identity with the same pubkey/uid, since it has now been reserved.
          yield that.cleanRejectedIdentities({
            pubkey: entry.pub,
            uid: entry.uid
          }, dal);
        }
      }
    })
  }

  cleanRejectedIdentities(idty, dal) {
    return co(function *() {
      yield dal.removeUnWrittenWithPubkey(idty.pubkey);
      yield dal.removeUnWrittenWithUID(idty.uid);
    })
  }

  updateMembers(block, dal) {
    return co(function *() {
      return co(function *() {
        // Joiners (come back)
        for (const inlineMS of block.joiners) {
          let ms = Membership.statics.fromInline(inlineMS);
          const idty = yield dal.getWrittenIdtyByPubkey(ms.issuer);
          dal.wotb.setEnabled(true, idty.wotb_id);
        }
        // Revoked
        for (const inlineRevocation of block.revoked) {
          let revocation = Identity.statics.revocationFromInline(inlineRevocation);
          yield dal.revokeIdentity(revocation.pubkey, block.number);
        }
        // Excluded
        for (const excluded of block.excluded) {
          const idty = yield dal.getWrittenIdtyByPubkey(excluded);
          dal.wotb.setEnabled(false, idty.wotb_id);
        }
      });
    })
  }

  updateWallets(sindex, aDal, reverse) {
    return co(function *() {
      const differentConditions = _.uniq(sindex.map((entry) => entry.conditions))
      for (const conditions of differentConditions) {
        const creates = _.filter(sindex, (entry) => entry.conditions === conditions && entry.op === common.constants.IDX_CREATE)
        const updates = _.filter(sindex, (entry) => entry.conditions === conditions && entry.op === common.constants.IDX_UPDATE)
        const positives = creates.reduce((sum, src) => sum + src.amount * Math.pow(10, src.base), 0)
        const negatives = updates.reduce((sum, src) => sum + src.amount * Math.pow(10, src.base), 0)
        const wallet = yield aDal.getWallet(conditions)
        let variation = positives - negatives
        if (reverse) {
          // To do the opposite operations, for a reverted block
          variation *= -1
        }
        wallet.balance += variation
        yield aDal.saveWallet(wallet)
      }
    })
  }

  revertBlock(number, hash, dal) {
    const that = this
    return co(function *() {

      const blockstamp = [number, hash].join('-');

      // Revert links
      const writtenOn = yield dal.cindexDAL.getWrittenOn(blockstamp);
      for (const entry of writtenOn) {
        const from = yield dal.getWrittenIdtyByPubkey(entry.issuer);
        const to = yield dal.getWrittenIdtyByPubkey(entry.receiver);
        if (entry.op == common.constants.IDX_CREATE) {
          // We remove the created link
          dal.wotb.removeLink(from.wotb_id, to.wotb_id, true);
        } else {
          // We add the removed link
          dal.wotb.addLink(from.wotb_id, to.wotb_id, true);
        }
      }

      // Revert nodes
      yield that.undoMembersUpdate(blockstamp, dal);

      // Get the money movements to revert in the balance
      const REVERSE_BALANCE = true
      const sindexOfBlock = yield dal.sindexDAL.getWrittenOn(blockstamp)

      yield dal.bindexDAL.removeBlock(number);
      yield dal.mindexDAL.removeBlock(blockstamp);
      yield dal.iindexDAL.removeBlock(blockstamp);
      yield dal.cindexDAL.removeBlock(blockstamp);
      yield dal.sindexDAL.removeBlock(blockstamp);

      // Then: normal updates
      const block = yield dal.getBlockByBlockstampOrNull(blockstamp);
      const previousBlock = yield dal.getBlock(number - 1);
      // Set the block as SIDE block (equivalent to removal from main branch)
      yield dal.blockDAL.setSideBlock(number, previousBlock);

      // Revert the balances variations for this block
      yield that.updateWallets(sindexOfBlock, dal, REVERSE_BALANCE)

      // Restore block's transaction as incoming transactions
      yield that.undoDeleteTransactions(block, dal)
    })
  }

  undoMembersUpdate(blockstamp, dal) {
    return co(function *() {
      const joiners = yield dal.iindexDAL.getWrittenOn(blockstamp);
      for (const entry of joiners) {
        // Undo 'join' which can be either newcomers or comebackers
        // => equivalent to i_index.member = true AND i_index.op = 'UPDATE'
        if (entry.member === true && entry.op === common.constants.IDX_UPDATE) {
          const idty = yield dal.getWrittenIdtyByPubkey(entry.pub);
          dal.wotb.setEnabled(false, idty.wotb_id);
        }
      }
      const newcomers = yield dal.iindexDAL.getWrittenOn(blockstamp);
      for (const entry of newcomers) {
        // Undo newcomers
        // => equivalent to i_index.op = 'CREATE'
        if (entry.op === common.constants.IDX_CREATE) {
          // Does not matter which one it really was, we pop the last X identities
          dal.wotb.removeNode();
        }
      }
      const excluded = yield dal.iindexDAL.getWrittenOn(blockstamp);
      for (const entry of excluded) {
        // Undo excluded (make them become members again in wotb)
        // => equivalent to m_index.member = false
        if (entry.member === false && entry.op === common.constants.IDX_UPDATE) {
          const idty = yield dal.getWrittenIdtyByPubkey(entry.pub);
          dal.wotb.setEnabled(true, idty.wotb_id);
        }
      }
    });
  }

  undoDeleteTransactions(block, dal) {
    return co(function *() {
      for (const obj of block.transactions) {
        obj.currency = block.currency;
        let tx = new Transaction(obj);
        yield dal.saveTransaction(tx);
      }
    });
  }

  /**
   * Delete certifications from the sandbox since it has been written.
   *
   * @param block Block in which are contained the certifications to remove from sandbox.
   * @param dal The DAL
   */
  removeCertificationsFromSandbox(block, dal) {
    return co(function*() {
      for (let inlineCert of block.certifications) {
        let cert = Certification.statics.fromInline(inlineCert);
        let idty = yield dal.getWritten(cert.to);
        cert.target = new Identity(idty).getTargetHash();
        yield dal.deleteCert(cert);
      }
    })
  }

  /**
   * Delete memberships from the sandbox since it has been written.
   *
   * @param block Block in which are contained the certifications to remove from sandbox.
   * @param dal The DAL
   */
  removeMembershipsFromSandbox(block, dal) {
    return co(function*() {
      const mss = block.joiners.concat(block.actives).concat(block.leavers);
      for (const inlineMS of mss) {
        let ms = Membership.statics.fromInline(inlineMS);
        yield dal.deleteMS(ms);
      }
    })
  }

  computeToBeRevoked(mindex, dal) {
    return co(function*() {
      const revocations = _.filter(mindex, (entry) => entry.revoked_on);
      for (const revoked of revocations) {
        yield dal.setRevoked(revoked.pub, true);
      }
    })
  }

  deleteTransactions(block, dal) {
    return co(function*() {
      for (const obj of block.transactions) {
        obj.currency = block.currency;
        const tx = new Transaction(obj);
        const txHash = tx.getHash();
        yield dal.removeTxByHash(txHash);
      }
    })
  }

  updateBlocksComputedVars(current, block) {
    return co(function*() {
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
    })
  }

  static pushStatsForBlocks(blocks, dal) {
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

  pushSideBlock(obj, dal, logger) {
    return co(function*() {
      const start = new Date();
      const block = new Block(obj);
      block.fork = true;
      try {
        // Saves the block (DAL)
        block.wrong = false;
        yield dal.saveSideBlockInFile(block);
        logger.info('SIDE Block #' + block.number + ' added to the blockchain in %s ms', (new Date() - start));
        return block;
      } catch (err) {
        throw err;
      }
    })
  }

  revertHead() {
    const indexRevert = super.indexRevert
    const headf = super.head
    return co(function*() {
      const head = yield headf()
      yield indexRevert(head.number)
    })
  }
}
