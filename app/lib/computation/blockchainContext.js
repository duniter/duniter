"use strict";
const _               = require('underscore');
const co              = require('co');
const Q               = require('q');
const indexer         = require('../dup/indexer');
const constants       = require('../constants');
const rules           = require('../rules/index');
const Identity        = require('../entity/identity');
const Certification   = require('../entity/certification');
const Membership      = require('../entity/membership');
const Block           = require('../entity/block');
const Transaction     = require('../entity/transaction');

module.exports = () => { return new BlockchainContext() };

function BlockchainContext() {

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
      vHEAD = yield indexer.completeGlobalScope(Block.statics.fromJSON(block).json(), conf, [], dal);
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
    const vHEAD = yield that.getvHeadCopy({ issuer });
    yield indexer.preparePersonalizedPoW(vHEAD, vHEAD_1, dal.range, conf);
    return vHEAD.issuerDiff;
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
    if (indexer.ruleMembershipDistance(mindex) === false) throw Error('ruleMembershipDistance');
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
    if (indexer.ruleToBeKickedArePresent(mindex, dal) === false) throw Error('ruleToBeKickedArePresent');
    // BR_G103
    if (indexer.ruleTxWritability(sindex) === false) throw Error('ruleToBeKickedArePresent');
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
    logger.debug('Applied block #%s', block.number);
  });

  this.revertBlock = (number, hash) => co(function *() {

    const blockstamp = [number, hash].join('-');

    // Revert links
    const writtenOn = yield dal.cindexDAL.getWrittenOn(blockstamp);
    for (const entry of writtenOn) {
      const from = yield dal.getWrittenIdtyByPubkey(entry.issuer);
      const to = yield dal.getWrittenIdtyByPubkey(entry.receiver);
      if (entry.op == constants.IDX_CREATE) {
        // We remove the created link
        dal.wotb.removeLink(from.wotb_id, to.wotb_id, true);
      } else {
        // We add the removed link
        dal.wotb.addLink(from.wotb_id, to.wotb_id, true);
      }
    }

    // Revert nodes
    yield undoMembersUpdate(blockstamp);

    yield dal.bindexDAL.removeBlock(number);
    yield dal.mindexDAL.removeBlock(blockstamp);
    yield dal.iindexDAL.removeBlock(blockstamp);
    yield dal.cindexDAL.removeBlock(blockstamp);
    yield dal.sindexDAL.removeBlock(blockstamp);

    // Then: normal updates
    const previousBlock = yield dal.getBlock(number - 1);
    // Set the block as SIDE block (equivalent to removal from main branch)
    yield dal.blockDAL.setSideBlock(number, previousBlock);

    // Remove any source created for this block (both Dividend and Transaction).
    yield dal.removeAllSourcesOfBlock(blockstamp);

    const block = yield dal.getBlockByBlockstampOrNull(blockstamp);
    if (block) {
      // For some reason the block might not exist (issue #827)
      yield undoDeleteTransactions(block);
    }
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

    const TAIL = yield dal.bindexDAL.tail();
    const bindexSize = [
      block.issuersCount,
      block.issuersFrame,
      conf.medianTimeBlocks,
      conf.dtDiffEval
    ].reduce((max, value) => {
      return Math.max(max, value);
    }, 0);
    const MAX_BINDEX_SIZE = 2*bindexSize;
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
      if (entry.op == constants.IDX_CREATE) {
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

  function undoMembersUpdate (blockstamp) {
    return co(function *() {
      const joiners = yield dal.iindexDAL.getWrittenOn(blockstamp);
      for (const entry of joiners) {
        // Undo 'join' which can be either newcomers or comebackers
        // => equivalent to i_index.member = true AND i_index.op = 'UPDATE'
        if (entry.member === true && entry.op === constants.IDX_UPDATE) {
          const idty = yield dal.getWrittenIdtyByPubkey(entry.pub);
          dal.wotb.setEnabled(false, idty.wotb_id);
        }
      }
      const newcomers = yield dal.iindexDAL.getWrittenOn(blockstamp);
      for (const entry of newcomers) {
        // Undo newcomers
        // => equivalent to i_index.op = 'CREATE'
        if (entry.op === constants.IDX_CREATE) {
          // Does not matter which one it really was, we pop the last X identities
          dal.wotb.removeNode();
        }
      }
      const excluded = yield dal.iindexDAL.getWrittenOn(blockstamp);
      for (const entry of excluded) {
        // Undo excluded (make them become members again in wotb)
        // => equivalent to m_index.member = false
        if (entry.member === false && entry.op === constants.IDX_UPDATE) {
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
}
