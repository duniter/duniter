"use strict";
const _               = require('underscore');
const co              = require('co');
const Q               = require('q');
const common          = require('duniter-common');
const indexer         = require('../indexer');
const constants       = require('../constants');
const rules           = require('../rules')
const Identity        = require('../entity/identity');
const Certification   = require('../entity/certification');
const Membership      = require('../entity/membership');
const Block           = require('../entity/block');
const Transaction     = require('../entity/transaction');

module.exports = (BlockchainService) => { return new BlockchainContext(BlockchainService) };

function BlockchainContext(BlockchainService) {

  const that = this;
  let conf, dal, logger;

  /**
   * The virtual next HEAD. Computed each time a new block is added, because a lot of HEAD variables are deterministic
   * and can be computed one, just after a block is added for later controls.
   */
  let vHEAD;

  /**
   * The currently written HEAD, aka. HEAD_1 relatively to incoming HEAD.
   */
  let vHEAD_1;

  let HEADrefreshed = Q();

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
  };

  this.checkBlock = (block, withPoWAndSignature) => co(function*(){
    if (withPoWAndSignature) {
      yield Q.nbind(rules.CHECK.ASYNC.ALL_LOCAL, rules, block, conf);
    }
    else {
      yield Q.nbind(rules.CHECK.ASYNC.ALL_LOCAL_BUT_POW, rules, block, conf);
    }
    const index = indexer.localIndex(block, conf);
    const mindex = indexer.mindex(index);
    const iindex = indexer.iindex(index);
    const sindex = indexer.sindex(index);
    const cindex = indexer.cindex(index);
    const HEAD = yield indexer.completeGlobalScope(block, conf, index, dal);
    const HEAD_1 = yield dal.bindexDAL.head(1);
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
    yield checkIssuer(block);
  });

  this.addBlock = (obj) => co(function*(){
    const start = new Date();
    const block = new Block(obj);
    try {
      const currentBlock = yield that.current();
      block.fork = false;
      yield saveBlockData(currentBlock, block);
      logger.info('Block #' + block.number + ' added to the blockchain in %s ms', (new Date() - start));
      vHEAD_1 = vHEAD = HEADrefreshed = null;
      return block;
    }
    catch(err) {
      throw err;
    }
  });

  this.addSideBlock = (obj) => co(function *() {
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
  });

  this.revertCurrentBlock = () => co(function *() {
    const head_1 = yield dal.bindexDAL.head(1);
    logger.debug('Reverting block #%s...', head_1.number);
    const res = yield that.revertBlock(head_1.number, head_1.hash);
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

  this.revertBlock = (number, hash) => co(function *() {

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
    yield undoMembersUpdate(blockstamp);

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
    yield undoDeleteTransactions(block)
  });

  const checkIssuer = (block) => co(function*() {
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
  });

  const matchesList = (regexp, list) => {
    let i = 0;
    let found = "";
    while (!found && i < list.length) {
      found = list[i].match(regexp) ? list[i] : "";
      i++;
    }
    return found;
  };

  this.current = () => dal.getCurrentBlockOrNull();

  const saveBlockData = (current, block) => co(function*() {

    if (block.number == 0) {
      yield that.saveParametersForRootBlock(block);
    }

    const indexes = yield dal.generateIndexes(block, conf);

    // Newcomers
    yield that.createNewcomers(indexes.iindex);

    // Save indexes
    yield dal.bindexDAL.saveEntity(indexes.HEAD);
    yield dal.mindexDAL.insertBatch(indexes.mindex);
    yield dal.iindexDAL.insertBatch(indexes.iindex);
    yield dal.sindexDAL.insertBatch(indexes.sindex);
    yield dal.cindexDAL.insertBatch(indexes.cindex);

    // Create/Update nodes in wotb
    yield that.updateMembers(block);

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

    yield updateBlocksComputedVars(current, block);
    // Saves the block (DAL)
    yield dal.saveBlock(block);

    // --> Update links
    yield dal.updateWotbLinks(indexes.cindex);

    // Create/Update certifications
    yield that.removeCertificationsFromSandbox(block);
    // Create/Update memberships
    yield that.removeMembershipsFromSandbox(block);
    // Compute to be revoked members
    yield that.computeToBeRevoked(indexes.mindex);
    // Delete eventually present transactions
    yield that.deleteTransactions(block);

    yield dal.trimSandboxes(block);

    return block;
  });

  const updateBlocksComputedVars = (current, block) => co(function*() {
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
  });

  let cleanRejectedIdentities = (idty) => co(function *() {
    yield dal.removeUnWrittenWithPubkey(idty.pubkey);
    yield dal.removeUnWrittenWithUID(idty.uid);
  });

  this.createNewcomers = (iindex) => co(function*() {
    for (const entry of iindex) {
      if (entry.op == common.constants.IDX_CREATE) {
        // Reserves a wotb ID
        entry.wotb_id = dal.wotb.addNode();
        logger.trace('%s was affected wotb_id %s', entry.uid, entry.wotb_id);
        // Remove from the sandbox any other identity with the same pubkey/uid, since it has now been reserved.
        yield cleanRejectedIdentities({
          pubkey: entry.pub,
          uid: entry.uid
        });
      }
    }
  });

  this.updateMembers = (block) => co(function *() {
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
  });

  this.updateWallets = (sindex, aDal, reverse) => co(function *() {
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
    });
  });

  function undoMembersUpdate (blockstamp) {
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

  function undoDeleteTransactions(block) {
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
   */
  this.removeCertificationsFromSandbox = (block) => co(function*() {
    for (let inlineCert of block.certifications) {
      let cert = Certification.statics.fromInline(inlineCert);
      let idty = yield dal.getWritten(cert.to);
      cert.target = new Identity(idty).getTargetHash();
      yield dal.deleteCert(cert);
    }
  });

  /**
   * Delete memberships from the sandbox since it has been written.
   *
   * @param block Block in which are contained the certifications to remove from sandbox.
   */
  this.removeMembershipsFromSandbox = (block) => co(function*() {
    const mss = block.joiners.concat(block.actives).concat(block.leavers);
    for (const inlineMS of mss) {
      let ms = Membership.statics.fromInline(inlineMS);
      yield dal.deleteMS(ms);
    }
  });

  that.saveParametersForRootBlock = (block) => co(function*() {
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
  });

  this.computeToBeRevoked = (mindex) => co(function*() {
    const revocations = _.filter(mindex, (entry) => entry.revoked_on);
    for (const revoked of revocations) {
      yield dal.setRevoked(revoked.pub, true);
    }
  });

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

  this.deleteTransactions = (block) => co(function*() {
    for (const obj of block.transactions) {
      obj.currency = block.currency;
      const tx = new Transaction(obj);
      const txHash = tx.getHash();
      yield dal.removeTxByHash(txHash);
    }
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
