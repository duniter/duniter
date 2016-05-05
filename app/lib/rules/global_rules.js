"use strict";

var Q              = require('q');
var co             = require('co');
var _              = require('underscore');
var constants      = require('../constants');
var crypto         = require('../crypto');
var rawer          = require('../rawer');
var Identity       = require('../entity/identity');
var Membership     = require('../entity/membership');
var Certification  = require('../entity/certification');
var logger         = require('../logger')('globr');
var unlock         = require('../txunlock');
var local_rules    = require('./local_rules');

let rules = {};

rules.FUNCTIONS = {

  checkNumber: (block, dal) => co(function *() {
    let current = yield dal.getCurrent();
    if (!current && block.number != 0) {
      throw Error('Root block required first');
    }
    else if (current && block.number <= current.number) {
      throw Error('Too late for this block');
    }
    else if (current && block.number > current.number + 1) {
      throw Error('Too early for this block');
    }
    return true;
  }),

  checkPoWMin: (block, conf, dal) => co(function *() {
    if (block.number > 0) {
      let correctPowMin = yield getPoWMinFor(block.number, conf, dal);
      if (block.powMin < correctPowMin) {
        throw Error('PoWMin value must be incremented');
      }
      else if (correctPowMin < block.powMin) {
        throw Error('PoWMin value must be decremented');
      }
    }
    return true;
  }),

  checkProofOfWork: (block, conf, dal) => co(function *() {
    // Compute exactly how much zeros are required for this block's issuer
    let difficulty = yield getTrialLevel(block.issuer, conf, dal);
    var remainder = difficulty % 16;
    var nbZerosReq = Math.max(0, (difficulty - remainder) / 16);
    var highMark = constants.PROOF_OF_WORK.UPPER_BOUND[remainder];
    var powRegexp = new RegExp('^0{' + nbZerosReq + '}' + '[0-' + highMark + ']');
    if (!block.hash.match(powRegexp)) {
      var givenZeros = Math.max(0, Math.min(nbZerosReq, block.hash.match(/^0*/)[0].length));
      var c = block.hash.substr(givenZeros, 1);
      throw Error('Wrong proof-of-work level: given ' + givenZeros + ' zeros and \'' + c + '\', required was ' + nbZerosReq + ' zeros and an hexa char between [0-' + highMark + ']');
    }
    return true;
  }),

  checkUD: (block, conf, dal) => co(function *() {
    let current = yield dal.getCurrent();
    let lastUDBlock = yield dal.lastUDBlock();
    let root = yield dal.getBlock(0);
    var lastUDTime = lastUDBlock ? lastUDBlock.UDTime : (root != null ? root.medianTime : 0);
    var UD = lastUDBlock ? lastUDBlock.dividend : conf.ud0;
    var UB = lastUDBlock ? lastUDBlock.unitbase : 0;
    var M = lastUDBlock ? lastUDBlock.monetaryMass : 0;
    var Nt1 = block.membersCount;
    var c = conf.c;
    var UDt1 = Nt1 > 0 ? Math.ceil(Math.max(UD, c * M / Math.pow(10,UB) / Nt1)) : 0;
    let UBt1 = UB;
    if (UDt1 >= Math.pow(10, constants.NB_DIGITS_UD)) {
      UDt1 = Math.ceil(UDt1 / 10.0);
      UBt1++;
    }
    if (!current && block.dividend) {
      throw Error('Root block cannot have UniversalDividend field');
    }
    else if (current && block.medianTime >= lastUDTime + conf.dt && UDt1 && !block.dividend) {
      throw Error('Block must have a UniversalDividend field');
    }
    else if (current && block.medianTime >= lastUDTime + conf.dt && UDt1 && block.dividend != UDt1) {
      throw Error('UniversalDividend must be equal to ' + UDt1);
    }
    else if (current && block.medianTime < lastUDTime + conf.dt && block.dividend) {
      throw Error('This block cannot have UniversalDividend');
    }
    else if (current && block.medianTime >= lastUDTime + conf.dt && UDt1 && block.unitbase != UBt1) {
      throw Error('UnitBase must be equal to ' + UBt1);
    }
    return true;
  }),

  checkPreviousHash: (block, dal) => co(function *() {
    let current = yield dal.getCurrent();
    if (current && block.previousHash != current.hash) {
      throw Error('PreviousHash not matching hash of current block');
    }
    return true;
  }),

  checkPreviousIssuer: (block, dal) => co(function *() {
    let current = yield dal.getCurrent();
    if (current && block.previousIssuer != current.issuer) {
      throw Error('PreviousIssuer not matching issuer of current block');
    }
    return true;
  }),

  checkMembersCountIsGood: (block, dal) => co(function *() {
    let current = yield dal.getCurrent();
    var currentCount = current ? current.membersCount : 0;
    var variation = block.joiners.length - block.excluded.length;
    if (block.membersCount != currentCount + variation) {
      throw Error('Wrong members count');
    }
    return true;
  }),

  checkIssuerIsMember: (block, dal) => co(function *() {
    let isMember = block.number == 0 ? isLocalMember(block.issuer, block) : yield dal.isMember(block.issuer);
    if (!isMember) {
      throw Error('Issuer is not a member');
    }
    return true;
  }),

  checkTimes: (block, conf, dal) => co(function *() {
    if (block.number > 0) {
      let medianTime = yield getMedianTime(block.number, conf, dal);
      if (medianTime != block.medianTime) {
        throw Error('Wrong MedianTime');
      }
    }
    return true;
  }),

  checkCertificationsAreMadeByMembers: (block, dal) => co(function *() {
    for (let i = 0, len = block.certifications.length; i < len; i++) {
      let cert = Certification.statics.fromInline(block.certifications[i]);
      let isMember = yield isAMember(cert.from, block, dal);
      if (!isMember) {
        throw Error('Certification from non-member');
      }
    }
    return true;
  }),

  checkCertificationsAreValid: (block, conf, dal) => co(function *() {
    for (let i = 0, len = block.certifications.length; i < len; i++) {
      let cert = Certification.statics.fromInline(block.certifications[i]);
      yield checkCertificationIsValid(block, cert, (b, pub) => {
        return getGlobalIdentity(b, pub, dal);
      }, conf, dal);
    }
    return true;
  }),

  checkCertificationsAreMadeToMembers: (block, dal) => co(function *() {
    for (let i = 0, len = block.certifications.length; i < len; i++) {
      let cert = Certification.statics.fromInline(block.certifications[i]);
      let isMember = yield isMemberOrJoiner(cert.to, block, dal);
      if (!isMember) {
        throw Error('Certification to non-member');
      }
    }
    return true;
  }),

  checkCertificationsAreMadeToNonLeaver: (block, dal) => co(function *() {
    for (let i = 0, len = block.certifications.length; i < len; i++) {
      let cert = Certification.statics.fromInline(block.certifications[i]);
      let isLeaving = yield dal.isLeaving(cert.to);
      if (isLeaving) {
        throw Error('Certification to leaver');
      }
    }
    return true;
  }),

  checkCertificationsDelayIsRespected: (block, conf, dal) => co(function *() {
    for (let i = 0, len = block.certifications.length; i < len; i++) {
      let cert = Certification.statics.fromInline(block.certifications[i]);
      let previous = yield dal.getPreviousLinks(cert.from, cert.to);
      let duration = previous && (block.medianTime - parseInt(previous.timestamp));
      if (previous && (duration <= conf.sigValidity)) {
        throw Error('A similar certification is already active');
      }
    }
    return true;
  }),

  checkCertificationsPeriodIsRespected: (block, conf, dal) => co(function *() {
    let current = yield dal.getCurrent();
    for (let i = 0, len = block.certifications.length; i < len; i++) {
      let cert = Certification.statics.fromInline(block.certifications[i]);
      let previous = yield dal.getLastValidFrom(cert.from);
      if (previous) {
        let duration = current.medianTime - parseInt(previous.timestamp);
        if (duration < conf.sigPeriod) {
          throw Error('Previous certification is not chainable yet');
        }
        let stock = yield dal.getValidLinksFrom(cert.from);
        if (stock >= conf.sigStock) {
          throw Error('Previous certification is not chainable yet');
        }
      }
    }
    return true;
  }),

  checkIdentitiesAreWritable: (block, conf, dal) => co(function *() {
    let current = yield dal.getCurrent();
    for (let i = 0, len = block.identities.length; i < len; i++) {
      let idty = Identity.statics.fromInline(block.identities[i]);
      let found = yield dal.getWrittenIdtyByUID(idty.uid);
      if (found) {
        throw Error('Identity already used');
      }
      if (current && idty.buid != constants.BLOCK.SPECIAL_BLOCK) {
        // Because the window rule does not apply on initial certifications
        let basedBlock = yield dal.getBlock(idty.buid);
        // Check if writable
        let duration = current.medianTime - parseInt(basedBlock.medianTime);
        if (duration > conf.idtyWindow) {
          throw Error('Identity is too old and cannot be written');
        }
      }
    }
    return true;
  }),

  checkCertificationsAreWritable: (block, conf, dal) => co(function *() {
    let current = yield dal.getCurrent();
    for (let i = 0, len = block.certifications.length; i < len; i++) {
      let cert = Certification.statics.fromInline(block.certifications[i]);
      if (current) {
        // Because the window rule does not apply on initial certifications
        let basedBlock = yield dal.getBlock(cert.block_number);
        // Check if writable
        let duration = current.medianTime - parseInt(basedBlock.medianTime);
        if (duration > conf.sigWindow) {
          throw Error('Certification is too old and cannot be written');
        }
      }
    }
    return true;
  }),

  checkMembershipsAreWritable: (block, conf, dal) => co(function *() {
    let current = yield dal.getCurrent();
    let fields = ['joiners', 'actives', 'leavers'];
    for (let m = 0, len2 = fields.length; m < len2; m++) {
      let field = fields[m];
      for (let i = 0, len = block[field].length; i < len; i++) {
        let ms = Membership.statics.fromInline(block[field][i]);
        if (ms.block != constants.BLOCK.SPECIAL_BLOCK) {
          let msBasedBlock = yield dal.getBlock(ms.block);
          let age = current.medianTime - msBasedBlock.medianTime;
          if (age > conf.msWindow) {
            throw 'Too old membership';
          }
        }
      }
    }
    return true;
  }),

  checkIdentityUnicity: (block, conf, dal) => co(function *() {
    for (let i = 0, len = block.identities.length; i < len; i++) {
      let idty = Identity.statics.fromInline(block.identities[i]);
      let found = yield dal.getWrittenIdtyByUID(idty.uid);
      if (found) {
        throw Error('Identity already used');
      }
    }
    return true;
  }),

  checkPubkeyUnicity: (block, conf, dal) => co(function *() {
    for (let i = 0, len = block.identities.length; i < len; i++) {
      let idty = Identity.statics.fromInline(block.identities[i]);
      let found = yield dal.getWrittenIdtyByPubkey(idty.pubkey);
      if (found) {
        throw Error('Pubkey already used');
      }
    }
    return true;
  }),

  checkJoiners: (block, conf, dal) => co(function *() {
    for (let i = 0, len = block.joiners.length; i < len; i++) {
      let ms = Membership.statics.fromInline(block.joiners[i]);
      yield checkMSTarget(ms, block, conf, dal);
      let idty = yield dal.getWrittenIdtyByPubkey(ms.issuer);
      if (idty && idty.currentMSN != -1 && idty.currentMSN >= ms.number) {
        throw Error('Membership\'s number must be greater than last membership of the pubkey');
      }
      if (idty && idty.member) {
        throw Error('Cannot be in joiners if already a member');
      }
    }
    return true;
  }),

  checkActives: (block, conf, dal) => co(function *() {
    for (let i = 0, len = block.actives.length; i < len; i++) {
      let ms = Membership.statics.fromInline(block.actives[i]);
      yield checkMSTarget(ms, block, conf, dal);
      let idty = yield dal.getWrittenIdtyByPubkey(ms.issuer);
      if (idty && idty.currentMSN != -1 && idty.currentMSN >= ms.number) {
        throw Error('Membership\'s number must be greater than last membership of the pubkey');
      }
      if (!idty || !idty.member) {
        throw Error('Cannot be in actives if not a member');
      }
    }
    return true;
  }),

  checkLeavers: (block, conf, dal) => co(function *() {
    for (let i = 0, len = block.leavers.length; i < len; i++) {
      let ms = Membership.statics.fromInline(block.leavers[i]);
      yield checkMSTarget(ms, block, conf, dal);
      let idty = yield dal.getWrittenIdtyByPubkey(ms.issuer);
      if (idty && idty.currentMSN != -1 && idty.currentMSN >= ms.number) {
        throw Error('Membership\'s number must be greater than last membership of the pubkey');
      }
      if (!idty || !idty.member) {
        throw Error('Cannot be in leavers if not a member');
      }
    }
    return true;
  }),

  checkRevoked: (block, conf, dal) => co(function *() {
    for (let i = 0, len = block.revoked.length; i < len; i++) {
      let sp = block.revoked[i].split(':');
      let pubkey = sp[0], sig = sp[1];
      let idty = yield dal.getWrittenIdtyByPubkey(pubkey);
      if (!idty) {
        throw Error("A pubkey who was never a member cannot be revoked");
      }
      if (idty.revoked) {
        throw Error("A revoked identity cannot be revoked again");
      }
      let rawRevocation = rawer.getOfficialRevocation({
        currency: block.currency,
        issuer: idty.pubkey,
        uid: idty.uid,
        buid: idty.buid,
        sig: idty.sig,
        revocation: ''
      });
      let sigOK = crypto.verify(rawRevocation, sig, pubkey);
      if (!sigOK) {
        throw Error("Revocation signature must match");
      }
    }
    return true;
  }),

  checkExcluded: (block, conf, dal) => co(function *() {
    for (let i = 0, len = block.excluded.length; i < len; i++) {
      let pubkey = block.excluded[i];
      let idty = yield dal.getWrittenIdtyByPubkey(pubkey);
      if (!idty) {
        throw Error("Cannot be in excluded if not a member");
      }
    }
    return true;
  }),

  checkJoinersHaveEnoughCertifications: (block, conf, dal) => co(function *() {
    if (block.number > 0) {
      var newLinks = getNewLinks(block);
      for (let i = 0, len = block.joiners.length; i < len; i++) {
        let ms = Membership.statics.fromInline(block.joiners[i]);
        let links = yield dal.getValidLinksTo(ms.issuer);
        let nbCerts = links.length + (newLinks[ms.issuer] || []).length;
        if (nbCerts < conf.sigQty) {
          throw Error('Joiner/Active does not gathers enough certifications');
        }
      }
    }
    return true;
  }),

  checkJoinersAreNotOudistanced: (block, conf, dal) => checkPeopleAreNotOudistanced(
    block.joiners.map((inlineMS) => Membership.statics.fromInline(inlineMS).issuer),
    getNewLinks(block),
    block.identities.map((inline) => Identity.statics.fromInline(inline).pubkey),
    conf, dal),

  checkActivesAreNotOudistanced: (block, conf, dal) => checkPeopleAreNotOudistanced(
    block.actives.map((inlineMS) => Membership.statics.fromInline(inlineMS).issuer),
    getNewLinks(block),
    block.identities.map((inline) => Identity.statics.fromInline(inline).pubkey),
    conf, dal),

  checkKickedMembersAreExcluded: (block, conf, dal) => co(function *() {
    let identities = yield dal.getToBeKicked();
    let remainingKeys = identities.map(function (idty) {
      return idty.pubkey;
    });
    remainingKeys = _(remainingKeys).difference(block.excluded);
    if (remainingKeys.length > 0) {
      throw Error('All kicked members must be present under Excluded members')
    }
    return true;
  }),

  checkJoinersAreNotRevoked: (block, conf, dal) => co(function *() {
    for (let i = 0, len = block.joiners.length; i < len; i++) {
      let ms = Membership.statics.fromInline(block.joiners[i]);
      let idty = yield dal.getWrittenIdtyByPubkey(ms.issuer);
      if (idty && idty.revoked) {
        throw Error('Revoked pubkeys cannot join');
      }
    }
    return true;
  }),

  checkSourcesAvailability: (block, conf, dal) => co(function *() {
    let txs = block.getTransactions();
    for (let i = 0, len = txs.length; i < len; i++) {
      let tx = txs[i];
      let unlocks = {};
      let sumOfInputs = 0;
      let maxInputBase = null;
      for (let k = 0, len2 = tx.unlocks.length; k < len2; k++) {
        let sp = tx.unlocks[k].split(':');
        let index = parseInt(sp[0]);
        unlocks[index] = sp[1];
      }
      for (let k = 0, len2 = tx.inputs.length; k < len2; k++) {
        let src = tx.inputs[k];
        let dbSrc = yield dal.getSource(src.identifier, src.noffset);
        logger.debug('Source %s:%s = %s', src.identifier, src.noffset, dbSrc && dbSrc.consumed);
        if (!dbSrc || dbSrc.consumed) {
          logger.warn('Source ' + [src.type, src.identifier, src.noffset].join(':') + ' is not available');
          throw constants.ERRORS.SOURCE_ALREADY_CONSUMED;
        }
        sumOfInputs += dbSrc.amount * Math.pow(10, dbSrc.base);
        if (maxInputBase == null) {
          maxInputBase = dbSrc.base;
        }
        maxInputBase = Math.max(maxInputBase, dbSrc.base);
        if (block.medianTime - dbSrc.time < tx.locktime) {
          throw constants.ERRORS.LOCKTIME_PREVENT;
        }
        let sigResults = local_rules.HELPERS.getSigResult(tx);
        let unlocksForCondition = [];
        let unlockValues = unlocks[k];
        if (dbSrc.conditions) {
          if (unlockValues) {
            // Evaluate unlock values
            let sp = unlockValues.split(' ');
            for (let j = 0, len3 = sp.length; j < len3; j++) {
              let func = sp[j];
              let param = func.match(/\((.+)\)/)[1];
              if (func.match(/^SIG/)) {
                let pubkey = tx.issuers[parseInt(param)];
                if (!pubkey) {
                  throw constants.ERRORS.WRONG_UNLOCKER;
                }
                unlocksForCondition.push({
                  pubkey: pubkey,
                  sigOK: sigResults.sigs[pubkey] && sigResults.sigs[pubkey].matching || false
                });
              } else {
                // XHX
                unlocksForCondition.push(param);
              }
            }
          }
          try {
            if (!unlock(dbSrc.conditions, unlocksForCondition)) {
              throw Error('Locked');
            }
          } catch (e) {
            logger.warn('Source ' + [src.type, src.identifier, src.noffset].join(':') + ' unlock fail');
            throw constants.ERRORS.WRONG_UNLOCKER;
          }
        }
      }
      let sumOfOutputs = tx.outputs.reduce(function(p, output) {
        if (output.base != maxInputBase) {
          throw constants.ERRORS.WRONG_OUTPUT_BASE;
        }
        return p + output.amount * Math.pow(10, output.base);
      }, 0);
      if (sumOfInputs !== sumOfOutputs) {
        logger.warn('Inputs/Outputs != 1 (%s/%s)', sumOfInputs, sumOfOutputs);
        throw constants.ERRORS.WRONG_AMOUNTS;
      }
    }
    return true;
  })
};

rules.HELPERS = {

  // Functions used in an external context too
  checkMembershipBlock: (ms, current, conf, dal) => checkMSTarget(ms, current ? { number: current.number + 1} : { number: 0 }, conf, dal),

  checkCertificationIsValid: (cert, current, findIdtyFunc, conf, dal) => checkCertificationIsValid(current ? current : { number: 0 }, cert, findIdtyFunc, conf, dal),

  checkCertificationIsValidForBlock: (cert, block, idty, conf, dal) => checkCertificationIsValid(block, cert, () => idty, conf, dal),

  isOver3Hops: (member, newLinks, newcomers, current, conf, dal) => co(function *() {
    if (!current) {
      return Q(false);
    }
    try {
      yield checkPeopleAreNotOudistanced([member], newLinks, newcomers, conf, dal);
      return false;
    } catch (e) {
      return true;
    }
  }),

  getTrialLevel: (issuer, conf, dal) => getTrialLevel(issuer, conf, dal),

  getPoWMin: (blockNumber, conf, dal) => getPoWMinFor(blockNumber, conf, dal),

  getMedianTime: (blockNumber, conf, dal) => getMedianTime(blockNumber, conf, dal),

  checkExistsUserID: (uid, dal) => dal.getWrittenIdtyByUID(uid),

  checkExistsPubkey: (pub, dal) => dal.getWrittenIdtyByPubkey(pub),

  checkSingleTransaction: (tx, block, conf, dal) => rules.FUNCTIONS.checkSourcesAvailability({
    getTransactions: () => [tx],
    medianTime: block.medianTime
  }, conf, dal)
};

/*****************************
 *
 *      UTILITY FUNCTIONS
 *
 *****************************/

/**
 * Get an identity, using global scope.
 * Considers identity collision + existence have already been checked.
 **/
function getGlobalIdentity (block, pubkey, dal) {
  return co(function *() {
    let localInlineIdty = block.getInlineIdentity(pubkey);
    if (localInlineIdty) {
      return Identity.statics.fromInline(localInlineIdty);
    }
    return dal.getWrittenIdtyByPubkey(pubkey);
  });
}

function isAMember(pubkey, block, dal) {
  if (block.number == 0) {
    return Q(isLocalMember(pubkey, block));
  } else {
    return dal.isMember(pubkey);
  }
}

function isMemberOrJoiner(pubkey, block, dal) {
  let isJoiner = isLocalMember(pubkey, block);
  return isJoiner ? Q(isJoiner) : dal.isMember(pubkey);
}

function isLocalMember(pubkey, block) {
  return block.isJoining(pubkey);
}

function checkMSTarget (ms, block, conf, dal) {
  return co(function *() {
    if (block.number == 0 && ms.number != 0) {
      throw Error('Number must be 0 for root block\'s memberships');
    }
    else if (block.number == 0 && ms.fpr != 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855') {
      throw Error('Hash must be E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855 for root block\'s memberships');
    }
    else if (block.number == 0) {
      return true; // Valid for root block
    } else {
      let basedBlock;
      try {
        basedBlock = yield dal.getBlockByNumberAndHash(ms.number, ms.fpr);
      } catch (e) {
        throw Error('Membership based on an unexisting block');
      }
      let current = yield dal.getCurrent();
      if (current && current.medianTime > basedBlock.medianTime + conf.msValidity) {
        throw Error('Membership has expired');
      }
      return true;
    }
  });
}

function checkCertificationIsValid (block, cert, findIdtyFunc, conf, dal) {
  return co(function *() {
    if (block.number == 0 && cert.block_number != 0) {
      throw Error('Number must be 0 for root block\'s certifications');
    } else {
      let basedBlock = {
        hash: constants.BLOCK.SPECIAL_HASH
      };
      if (block.number != 0) {
        try {
          basedBlock = yield dal.getBlock(cert.block_number);
        } catch (e) {
          throw Error('Certification based on an unexisting block');
        }
      }
      let idty = yield findIdtyFunc(block, cert.to, dal);
      let current = block.number == 0 ? null : yield dal.getCurrent();
      if (!idty) {
        throw Error('Identity does not exist for certified');
      }
      else if (current && current.medianTime > basedBlock.medianTime + conf.sigValidity) {
        throw Error('Certification has expired');
      }
      else if (cert.from == idty.pubkey)
        throw Error('Rejected certification: certifying its own self-certification has no meaning');
      else {
        var buid = [cert.block_number, basedBlock.hash].join('-');
        idty.currency = conf.currency;
        let verified = crypto.isValidCertification(new Identity(idty), cert.from, cert.sig, buid, block.currency);
        if (!verified) {
          throw Error('Wrong signature for certification');
        }
        return true;
      }
    }
  });
}

function checkPeopleAreNotOudistanced (pubkeys, newLinks, newcomers, conf, dal) {
  return co(function *() {
    let wotb = dal.wotb;
    let current = yield dal.getCurrent();
    let membersCount = current ? current.membersCount : 0;
    // TODO: make a temporary copy of the WoT in RAM
    // We add temporarily the newcomers to the WoT, to integrate their new links
    let nodesCache = newcomers.reduce((map, pubkey) => {
      let nodeID = wotb.addNode();
      map[pubkey] = nodeID;
      wotb.setEnabled(false, nodeID); // These are not members yet
      return map;
    }, {});
    // Add temporarily the links to the WoT
    let tempLinks = [];
    let toKeys = _.keys(newLinks);
    for (let i = 0, len = toKeys.length; i < len; i++) {
      let toKey = toKeys[i];
      let toNode = yield getNodeIDfromPubkey(nodesCache, toKey, dal);
      for (let j = 0, len2 = newLinks[toKey].length; j < len2; j++) {
        let fromKey = newLinks[toKey][j];
        let fromNode = yield getNodeIDfromPubkey(nodesCache, fromKey, dal);
        tempLinks.push({ from: fromNode, to: toNode });
      }
    }
    tempLinks.forEach((link) => wotb.addLink(link.from, link.to));
    // Checking distance of each member against them
    let error;
    for (let i = 0, len = pubkeys.length; i < len; i++) {
      let pubkey = pubkeys[i];
      let nodeID = yield getNodeIDfromPubkey(nodesCache, pubkey, dal);
      let dSen = Math.ceil(constants.CONTRACT.DSEN_P * Math.exp(Math.log(membersCount) / conf.stepMax));
      let isOutdistanced = wotb.isOutdistanced(nodeID, dSen, conf.stepMax, conf.xpercent);
      if (isOutdistanced) {
        error = Error('Joiner/Active is outdistanced from WoT');
        break;
      }
    }
    // Undo temp links/nodes
    tempLinks.forEach((link) => wotb.removeLink(link.from, link.to));
    newcomers.forEach(() => wotb.removeNode());
    if (error) {
      throw error;
    }
  });
}

function getNodeIDfromPubkey(nodesCache, pubkey, dal) {
  return co(function *() {
    let toNode = nodesCache[pubkey];
    // Eventually cache the target nodeID
    if (toNode === null || toNode === undefined) {
      let idty = yield dal.getWrittenIdtyByPubkey(pubkey);
      toNode = idty.wotb_id;
      nodesCache[pubkey] = toNode;
    }
    return toNode;
  });
}

function getTrialLevel (issuer, conf, dal) {
  return co(function *() {
    // Compute exactly how much zeros are required for this block's issuer
    let percentRot = conf.percentRot;
    let current = yield dal.getCurrent();
    if (!current) {
      return 0;
    }
    let last = yield dal.lastBlockOfIssuer(issuer);
    let powMin = yield getPoWMinFor(current.number + 1, conf, dal);
    let issuers = [];
    if (last) {
      let blocksBetween = yield dal.getBlocksBetween(last.number - 1 - conf.blocksRot, last.number - 1);
      issuers = _.pluck(blocksBetween, 'issuer');
    } else {
      // So we can have nbPreviousIssuers = 0 & nbBlocksSince = 0 for someone who has never written any block
      last = { number: current.number };
    }
    var nbPreviousIssuers = _(_(issuers).uniq()).without(issuer).length;
    var nbBlocksSince = current.number - last.number;
    let personal_diff = Math.max(powMin, powMin * Math.floor(percentRot * (1 + nbPreviousIssuers) / (1 + nbBlocksSince)));
    if (personal_diff + 1 % 16 == 0) {
      personal_diff++;
    }
    return personal_diff;
  });
}

/**
 * Deduce the PoWMin field for a given block number
 */
function getPoWMinFor (blockNumber, conf, dal) {
  return Q.Promise(function(resolve, reject){
    if (blockNumber == 0) {
      reject('Cannot deduce PoWMin for block#0');
    } else if (blockNumber % conf.dtDiffEval != 0) {
      co(function *() {
        var previous = yield dal.getBlock(blockNumber - 1);
        return previous.powMin;
      })
        .then(resolve)
        .catch(function(err) {
          reject(err);
          throw err;
        });
    } else {
      co(function *() {
        var previous = yield dal.getBlock(blockNumber - 1);
        var medianTime = yield getMedianTime(blockNumber, conf, dal);
        var speedRange = Math.min(conf.dtDiffEval, blockNumber);
        var lastDistant = yield dal.getBlock(Math.max(0, blockNumber - speedRange));
        // Compute PoWMin value
        var duration = medianTime - lastDistant.medianTime;
        var speed = speedRange / duration;
        var maxGenTime = Math.ceil(conf.avgGenTime * Math.sqrt(1.066));
        var minGenTime = Math.floor(conf.avgGenTime / Math.sqrt(1.066));
        var maxSpeed = 1.0 / minGenTime;
        var minSpeed = 1.0 / maxGenTime;
        // logger.debug('Current speed is', speed, '(' + conf.dtDiffEval + '/' + duration + ')', 'and must be [', minSpeed, ';', maxSpeed, ']');
        if (speed >= maxSpeed) {
          // Must increase difficulty
          if ((previous.powMin + 2) % 16 == 0) {
            // Avoid (16*n - 1) value
            resolve(previous.powMin + 2);
          } else {
            resolve(previous.powMin + 1);
          }
        }
        else if (speed <= minSpeed) {
          // Must decrease difficulty
          if (previous.powMin % 16 == 0) {
            // Avoid (16*n - 1) value
            resolve(Math.max(0, previous.powMin - 2));
          } else {
            resolve(Math.max(0, previous.powMin - 1));
          }
        }
        else {
          // Must not change difficulty
          resolve(previous.powMin);
        }
      })
        .catch(reject);
    }
  });
}

function getMedianTime (blockNumber, conf, dal) {
  return co(function *() {
    if (blockNumber == 0) {
      // No rule to check for block#0
      return 0;
    }
    // Get the number of blocks we can look back from this block
    let blocksCount = blockNumber < conf.medianTimeBlocks ? blockNumber : conf.medianTimeBlocks;
    // Get their 'time' value
    // console.log('Times between ', blockNumber - blocksCount, blockNumber - 1);
    let blocksBetween = yield dal.getBlocksBetween(blockNumber - blocksCount, blockNumber - 1);
    let timeValues = _.pluck(blocksBetween, 'time');
    timeValues.sort();
    let sum = 0;
    for (let i = 0, len = timeValues.length; i < len; i++) {
      sum += timeValues[i];
    }
    if (timeValues.length) {
      return Math.floor(sum / timeValues.length);
    }
    else {
      throw Error('No block found for MedianTime comparison');
    }
  });
}

function getNewLinks (block) {
  var newLinks = {};
  block.certifications.forEach(function(inlineCert){
    var cert = Certification.statics.fromInline(inlineCert);
    newLinks[cert.to] = newLinks[cert.to] || [];
    newLinks[cert.to].push(cert.from);
  });
  return newLinks;
}

module.exports = rules;
