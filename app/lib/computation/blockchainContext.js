"use strict";
const _               = require('underscore');
const co              = require('co');
const Q               = require('q');
const indexer         = require('../dup/indexer');
const hashf           = require('../ucp/hashf');
const rawer           = require('../ucp/rawer');
const constants       = require('../constants');
const rules           = require('../rules/index');
const Identity        = require('../entity/identity');
const Certification   = require('../entity/certification');
const Membership      = require('../entity/membership');
const Block           = require('../entity/block');
const Link            = require('../entity/link');
const Source          = require('../entity/source');
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
   * @param version The version in which is computed the difficulty.
   * @param issuer The issuer we want to get the difficulty level.
   */
  this.getIssuerPersonalizedDifficulty = (version, issuer) => co(function *() {
    const vHEAD = yield that.getvHeadCopy({ version, issuer });
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
      yield Q.nbind(rules.CHECK.ASYNC.ALL_GLOBAL, rules, block, conf, dal, that);
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
      // BR_G62
      if (indexer.ruleProofOfWork(HEAD) === false) throw Error('ruleProofOfWork');
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
      // BR_G87
      if (indexer.ruleInputIsAvailable(sindex) === false) throw Error('ruleInputIsAvailable');
      // BR_G88
      if (indexer.ruleInputIsUnlocked(sindex) === false) throw Error('ruleInputIsUnlocked');
      // BR_G89
      if (indexer.ruleInputIsTimeUnlocked(sindex) === false) throw Error('ruleInputIsTimeUnlocked');
      // BR_G90
      if (indexer.ruleOutputBase(sindex, HEAD_1) === false) throw Error('ruleOutputBase');
    }
    else {
      yield Q.nbind(rules.CHECK.ASYNC.ALL_LOCAL_BUT_POW, rules, block, conf);
      yield Q.nbind(rules.CHECK.ASYNC.ALL_GLOBAL_BUT_POW, rules, block, conf, dal);
    }
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
    const current = yield that.current();
    logger.debug('Reverting block #%s...', current.number);
    const res = yield that.revertBlock(current);
    logger.debug('Reverted block #%s', current.number);
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
    const res = yield that.addBlock(block);
    logger.debug('Applied block #%s', block.number);
    // return res;
  });

  this.revertBlock = (block) => co(function *() {
    const previousBlock = yield dal.getBlockByNumberAndHashOrNull(block.number - 1, block.previousHash || '');
    // Set the block as SIDE block (equivalent to removal from main branch)
    yield dal.blockDAL.setSideBlock(block, previousBlock);
    yield undoCertifications(block);
    yield undoLinks(block);
    yield dal.unflagExpiredIdentitiesOf(block.number);
    yield dal.unflagExpiredCertificationsOf(block.number);
    if (previousBlock) {
      yield dal.undoObsoleteLinks(previousBlock.medianTime - conf.sigValidity);
    }
    yield undoMembersUpdate(block);
    yield undoTransactionSources(block);
    yield undoDeleteTransactions(block);
    yield dal.bindexDAL.removeBlock(block.number);
    yield dal.iindexDAL.removeBlock([block.number, block.hash].join('-'));
    yield dal.mindexDAL.removeBlock([block.number, block.hash].join('-'));
    yield dal.cindexDAL.removeBlock([block.number, block.hash].join('-'));
    yield dal.sindexDAL.removeBlock([block.number, block.hash].join('-'));
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
    yield that.saveParametersForRootBlock(block);
    yield dal.saveIndexes(block, conf);
    yield updateBlocksComputedVars(current, block);
    // Saves the block (DAL)
    yield dal.saveBlock(block);
    // Create/Update members (create new identities if do not exist)
    yield that.updateMembers(block);
    // Create/Update certifications
    yield that.updateCertifications(block);
    // Save links
    yield that.updateLinksForBlocks([block], dal.getBlock.bind(dal));
    // Compute obsolete links
    yield that.computeObsoleteLinks(block);
    // Compute obsolete memberships (active, joiner)
    yield that.computeObsoleteMemberships(block);
    // Compute obsolete identities
    yield that.computeExpiredIdentities(block);
    // Compute obsolete certifications
    yield that.computeExpiredCertifications(block);
    // Compute obsolete memberships
    yield that.computeExpiredMemberships(block);
    // Update consumed sources & create new ones
    yield that.updateSources(block);
    // Delete eventually present transactions
    yield that.deleteTransactions(block);
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
      block.UDTime = block.medianTime; // Root = first UD time
      block.dividend = null;
    }
    else if (block.dividend) {
      const result = yield {
        last: dal.lastUDBlock(),
        root: dal.getBlock(0)
      };
      block.UDTime = conf.dt + (result.last ? result.last.UDTime : result.root.medianTime);
    }
    else {
      block.dividend = null;
      block.UDTime = current.UDTime;
    }
  });

  let cleanRejectedIdentities = (idty) => co(function *() {
    yield dal.removeUnWrittenWithPubkey(idty.pubkey);
    yield dal.removeUnWrittenWithUID(idty.uid);
  });

  this.updateMembers = (block) => co(function *() {
    return co(function *() {
      // Newcomers
      for (const identity of block.identities) {
        let idty = Identity.statics.fromInline(identity);
        // Computes the hash if not done yet
        if (!idty.hash)
          idty.hash = (hashf(rawer.getOfficialIdentity(idty)) + "").toUpperCase();
        yield dal.newIdentity(idty);
        yield cleanRejectedIdentities(idty);
      }
      // Joiners (come back)
      for (const inlineMS of block.joiners) {
        let ms = Membership.statics.fromInline(inlineMS);
        yield dal.joinIdentity(ms.issuer, ms.number);
      }
      // Actives
      for (const inlineMS of block.actives) {
        let ms = Membership.statics.fromInline(inlineMS);
        yield dal.activeIdentity(ms.issuer, ms.number);
      }
      // Leavers
      for (const inlineMS of block.leavers) {
        let ms = Membership.statics.fromInline(inlineMS);
        yield dal.leaveIdentity(ms.issuer, ms.number);
      }
      // Revoked
      for (const inlineRevocation of block.revoked) {
        let revocation = Identity.statics.revocationFromInline(inlineRevocation);
        yield dal.revokeIdentity(revocation.pubkey, block.number);
      }
      // Excluded
      for (const excluded of block.excluded) {
        dal.excludeIdentity(excluded);
      }
    });
  });

  function undoMembersUpdate (block) {
    return co(function *() {
      yield dal.unFlagToBeKicked();
      // Undo 'join' which can be either newcomers or comebackers
      for (const msRaw of block.joiners) {
        let ms = Membership.statics.fromInline(msRaw, 'IN', conf.currency);
        yield dal.unJoinIdentity(ms);
      }
      // Undo newcomers (may strengthen the undo 'join')
      for (const identity of block.identities) {
        let idty = Identity.statics.fromInline(identity);
        yield dal.unacceptIdentity(idty.pubkey);
      }
      // Undo renew (only remove last membership IN document)
      for (const msRaw of block.actives) {
        let ms = Membership.statics.fromInline(msRaw, 'IN', conf.currency);
        yield dal.unRenewIdentity(ms);
      }
      // Undo leavers (forget about their last membership OUT document)
      for (const msRaw of block.leavers) {
        let ms = Membership.statics.fromInline(msRaw, 'OUT', conf.currency);
        yield dal.unLeaveIdentity(ms);
      }
      // Undo revoked (make them non-revoked)
      let revokedPubkeys = [];
      for (const inlineRevocation of block.revoked) {
        let revocation = Identity.statics.revocationFromInline(inlineRevocation);
        revokedPubkeys.push(revocation.pubkey);
        yield dal.unrevokeIdentity(revocation.pubkey);
      }
      // Undo excluded (make them become members again, but set them as 'to be kicked')
      for (const pubkey of block.excluded) {
        yield dal.unExcludeIdentity(pubkey, revokedPubkeys.indexOf(pubkey) !== -1);
      }
    });
  }

  function undoCertifications(block) {
    return co(function *() {
      for (const inlineCert of block.certifications) {
        let cert = Certification.statics.fromInline(inlineCert);
        let toIdty = yield dal.getWrittenIdtyByPubkey(cert.to);
        cert.target = new Identity(toIdty).getTargetHash();
        let existing = yield dal.existsCert(cert);
        existing.written_block = null;
        existing.written_hash = null;
        existing.linked = false;
        existing.written = false;
        yield dal.saveCert(new Certification(cert));
      }
    });
  }

  function undoLinks(block) {
    return co(function *() {
      for (const inlineCert of block.certifications) {
        let cert = Certification.statics.fromInline(inlineCert);
        let fromIdty = yield dal.getWrittenIdtyByPubkey(cert.from);
        let toIdty = yield dal.getWrittenIdtyByPubkey(cert.to);
        dal.removeLink(
          new Link({
            source: cert.from,
            target: cert.to,
            from_wotb_id: fromIdty.wotb_id,
            to_wotb_id: toIdty.wotb_id,
            timestamp: block.medianTime,
            block_number: block.number,
            block_hash: block.hash,
            obsolete: false
          }));
      }
    });
  }

  function undoTransactionSources(block) {
    return co(function *() {
      // Remove any source created for this block (both Dividend and Transaction)
      dal.removeAllSourcesOfBlock(block.number);
      for (const obj of block.transactions) {
        obj.currency = block.currency;
        obj.issuers = obj.signatories;
        let tx = new Transaction(obj);
        let txObj = tx.getTransaction();
        for (const input of txObj.inputs) {
          yield dal.unConsumeSource(input.identifier, input.noffset);
        }
      }
    });
  }

  function undoDeleteTransactions(block) {
    return co(function *() {
      for (const obj of block.transactions) {
        obj.currency = block.currency;
        obj.issuers = obj.signatories;
        let tx = new Transaction(obj);
        yield dal.saveTransaction(tx);
      }
    });
  }

  /**
   * Historical method that takes certifications from a block and tries to either:
   *  * Update the certification found in the DB an set it as written
   *  * Create it if it does not exist
   *
   * Has a sibling method named 'updateCertificationsForBlocks'.
   * @param block
   * @param done
   */
  this.updateCertifications = (block) => co(function*() {
    for (let inlineCert of block.certifications) {
      let cert = Certification.statics.fromInline(inlineCert);
      let idty = yield dal.getWritten(cert.to);
      cert.target = new Identity(idty).getTargetHash();
      const to_uid = idty.uid;
      idty = yield dal.getWritten(cert.from);
      const from_uid = idty.uid;
      const existing = yield dal.existsCert(cert);
      if (existing) {
        cert = existing;
      }
      cert.written_block = block.number;
      cert.written_hash = block.hash;
      cert.from_uid = from_uid;
      cert.to_uid = to_uid;
      cert.linked = true;
      yield dal.officializeCertification(new Certification(cert));
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
      conf.blocksRot = bconf.blocksRot;
      conf.percentRot = bconf.percentRot;
      conf.currency = block.currency;
      // Super important: adapt wotb module to handle the correct stock
      dal.wotb.setMaxCert(conf.sigStock);
      return dal.saveConf(conf);
    }
  });

  this.computeObsoleteLinks = (block) => co(function*() {
    yield dal.obsoletesLinks(block.medianTime - conf.sigValidity);
    const members = yield dal.getMembersWithoutEnoughValidLinks(conf.sigQty);
    for (const idty of members) {
      yield dal.setKicked(idty.pubkey, new Identity(idty).getTargetHash(), true);
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

  this.computeObsoleteMemberships = (block) => co(function *() {
    let lastForKick = yield dal.getMembershipExcludingBlock(block, conf.msValidity);
    let lastForRevoke = yield dal.getMembershipRevocatingBlock(block, conf.msValidity * constants.REVOCATION_FACTOR);
    if (lastForKick) {
      yield dal.kickWithOutdatedMemberships(lastForKick.number);
    }
    if (lastForRevoke) {
      yield dal.revokeWithOutdatedMemberships(lastForRevoke.number);
    }
  });

  this.computeExpiredIdentities = (block) => co(function *() {
    let lastForExpiry = yield dal.getIdentityExpiringBlock(block, conf.idtyWindow);
    if (lastForExpiry) {
      yield dal.flagExpiredIdentities(lastForExpiry.number, block.number);
    }
  });

  this.computeExpiredCertifications = (block) => co(function *() {
    let lastForExpiry = yield dal.getCertificationExpiringBlock(block, conf.certWindow);
    if (lastForExpiry) {
      yield dal.flagExpiredCertifications(lastForExpiry.number, block.number);
    }
  });

  this.computeExpiredMemberships = (block) => co(function *() {
    let lastForExpiry = yield dal.getMembershipExpiringBlock(block, conf.certWindow);
    if (lastForExpiry) {
      yield dal.flagExpiredMemberships(lastForExpiry.number, block.number);
    }
  });

  this.updateSources = (block) => co(function*() {
    if (block.dividend) {
      const idties = yield dal.getMembers();
      for (const idty of idties) {
        yield dal.saveSource(new Source({
          'type': 'D',
          'number': block.number,
          'time': block.medianTime,
          'identifier': idty.pubkey,
          'noffset': block.number,
          'block_hash': block.hash,
          'amount': block.dividend,
          'base': block.unitbase,
          'conditions': 'SIG(' + idty.pubkey + ')', // Only this pubkey can unlock its UD
          'consumed': 0
        }));
      }
    }

    for (const obj of block.transactions) {
      obj.currency = block.currency;
      obj.issuers = obj.signatories;
      const tx = new Transaction(obj);
      const txObj = tx.getTransaction();
      const txHash = tx.getHash(true);
      for (const input of txObj.inputs) {
        yield dal.setConsumedSource(input.identifier, input.noffset);
      }

      let index = 0;
      for (const output of txObj.outputs) {
        yield dal.saveSource(new Source({
          'type': 'T',
          'number': block.number,
          'time': block.medianTime,
          'identifier': txHash,
          'noffset': index++,
          'block_hash': block.hash,
          'amount': output.amount,
          'base': output.base,
          'conditions': output.conditions,
          'consumed': 0
        }));
      }
    }
  });

  /**
   * New method for CREATING memberships found in blocks.
   * Made for performance reasons, this method will batch insert all memberships at once.
   * @param blocks
   * @returns {*}
   */
  this.updateMembershipsForBlocks = (blocks) => co(function *() {
    const memberships = [];
    const types = {
      'join': 'joiners',
      'active': 'actives',
      'leave': 'leavers'
    };
    for (const block of blocks) {
      _.keys(types).forEach(function(type){
        const msType = type == 'leave' ? 'out' : 'in';
        const field = types[type];
        const mss = block[field];
        for (const msRaw of mss) {
          const ms = Membership.statics.fromInline(msRaw, type == 'leave' ? 'OUT' : 'IN', block.currency);
          ms.membership = msType.toUpperCase();
          ms.written = true;
          ms.written_number = block.number;
          ms.type = type;
          ms.hash = String(hashf(ms.getRawSigned())).toUpperCase();
          ms.idtyHash = (hashf(ms.userid + ms.certts + ms.issuer) + "").toUpperCase();
          memberships.push(ms);
        }
      });
    }
    return dal.updateMemberships(memberships);
  });

  /**
   * New method for CREATING links found in blocks.
   * Made for performance reasons, this method will batch insert all links at once.
   * @param blocks
   * @param getBlock
   * @returns {*}
   */
  this.updateLinksForBlocks = (blocks, getBlock) => co(function *() {
    let links = [];
    for (const block of blocks) {
      for (const inlineCert of block.certifications) {
        let cert = Certification.statics.fromInline(inlineCert);
        let tagBlock = block;
        if (block.number > 0) {
          tagBlock = yield getBlock(cert.block_number);
        }
        let fromIdty = yield dal.getWrittenIdtyByPubkey(cert.from);
        let toIdty = yield dal.getWrittenIdtyByPubkey(cert.to);
        links.push({
          source: cert.from,
          target: cert.to,
          from_wotb_id: fromIdty.wotb_id,
          to_wotb_id: toIdty.wotb_id,
          timestamp: tagBlock.medianTime,
          block_number: block.number,
          block_hash: block.hash,
          obsolete: false
        });
      }
    }
    return dal.updateLinks(links);
  });

  /**
   * New method for CREATING transactions found in blocks.
   * Made for performance reasons, this method will batch insert all transactions at once.
   * @param blocks
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
        if (tx.version >= 3) {
          const sp = tx.blockstamp.split('-');
          tx.blockstampTime = (yield getBlockByNumberAndHash(sp[0], sp[1])).medianTime;
        }
        const txEntity = new Transaction(tx);
        txEntity.computeAllHashes();
        newOnes.push(txEntity);
      }
      txs = txs.concat(newOnes);
    }
    return dal.updateTransactions(txs);
  });

  /**
   * New method for CREATING certifications found in blocks.
   * Made for performance reasons, this method will batch insert all certifications at once.
   * @param blocks
   * @returns {*}
   */
  this.updateCertificationsForBlocks = (blocks) => co(function *() {
    const certs = [];
    for (const block of blocks) {
      for (const inlineCert of block.certifications) {
        let cert = Certification.statics.fromInline(inlineCert);
        const to = yield dal.getWrittenIdtyByPubkey(cert.to);
        const to_uid = to.uid;
        cert.target = new Identity(to).getTargetHash();
        const from = yield dal.getWrittenIdtyByPubkey(cert.from);
        const from_uid = from.uid;
        const existing = yield dal.existsCert(cert);
        if (existing) {
          cert = existing;
        }
        cert.written_block = block.number;
        cert.written_hash = block.hash;
        cert.from_uid = from_uid;
        cert.to_uid = to_uid;
        cert.linked = true;
        certs.push(cert);
      }
    }
    return dal.updateCertifications(certs);
  });

  /**
   * New method for CREATING sources found in transactions of blocks.
   * Made for performance reasons, this method will batch insert all sources at once.
   * @param blocks
   * @returns {*}
   */
  this.updateTransactionSourcesForBlocks = (blocks, dividends) => co(function *() {
    let sources = dividends;
    for (const block of blocks) {
      // Transactions
      for (const json of block.transactions) {
        let obj = json;
        obj.currency = block.currency;
        obj.issuers = json.signatories;
        let tx = new Transaction(obj);
        tx.computeAllHashes();
        let txObj = tx.getTransaction();
        let txHash = tx.getHash();
        sources = sources.concat(txObj.inputs.map((input) => _.extend({ toConsume: true }, input)));
        sources = sources.concat(txObj.outputs.map((output, index) => _.extend({
          toConsume: false
        }, {
          'type': 'T',
          'number': block.number,
          'block_hash': block.hash,
          'fingerprint': txHash,
          'amount': output.amount,
          'base': output.base,
          'consumed': false,
          'identifier': txHash,
          'noffset': index,
          'conditions': output.conditions
        })));
      }
    }
    try {
      let res = yield dal.updateSources(sources);
      return res;
    } catch (e) {
      throw e;
    }
  });

  this.deleteTransactions = (block) => co(function*() {
    for (const obj of block.transactions) {
      obj.currency = block.currency;
      obj.issuers = obj.signatories;
      const tx = new Transaction(obj);
      const txHash = tx.getHash();
      yield dal.removeTxByHash(txHash);
    }
  });
}
