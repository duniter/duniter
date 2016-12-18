"use strict";

const Q              = require('q');
const co             = require('co');
const _              = require('underscore');
const constants      = require('../constants');
const keyring         = require('../crypto/keyring');
const rawer          = require('../ucp/rawer');
const Identity       = require('../entity/identity');
const Membership     = require('../entity/membership');
const Certification  = require('../entity/certification');
const Transaction    = require('../entity/transaction');
const logger         = require('../logger')('globr');
const unlock         = require('../ucp/txunlock');
const local_rules    = require('./local_rules');

let rules = {};

// TODO: all the global rules should be replaced by index rule someday

rules.FUNCTIONS = {

  checkCertificationsAreMadeByMembers: (block, dal) => co(function *() {
    for (const obj of block.certifications) {
      let cert = Certification.statics.fromInline(obj);
      let isMember = yield isAMember(cert.from, block, dal);
      if (!isMember) {
        throw Error('Certification from non-member');
      }
    }
    return true;
  }),

  checkCertificationsAreValid: (block, conf, dal) => co(function *() {
    for (const obj of block.certifications) {
      let cert = Certification.statics.fromInline(obj);
      yield checkCertificationIsValid(block, cert, (b, pub) => {
        return getGlobalIdentity(b, pub, dal);
      }, conf, dal);
    }
    return true;
  }),

  checkCertificationsAreMadeToMembers: (block, dal) => co(function *() {
    for (const obj of block.certifications) {
      let cert = Certification.statics.fromInline(obj);
      let isMember = yield isMemberOrJoiner(cert.to, block, dal);
      if (!isMember) {
        throw Error('Certification to non-member');
      }
    }
    return true;
  }),

  checkCertificationsAreMadeToNonLeaver: (block, dal) => co(function *() {
    for (const obj of block.certifications) {
      let cert = Certification.statics.fromInline(obj);
      let isLeaving = yield dal.isLeaving(cert.to);
      if (isLeaving) {
        throw Error('Certification to leaver');
      }
    }
    return true;
  }),

  checkCertificationsDelayIsRespected: (block, conf, dal) => co(function *() {
    for (const obj of block.certifications) {
      let cert = Certification.statics.fromInline(obj);
      let previous = yield dal.getPreviousLinks(cert.from, cert.to);
      let duration = previous && (block.medianTime - parseInt(previous.timestamp));
      if (previous && (duration <= conf.sigValidity)) {
        throw Error('A similar certification is already active');
      }
    }
    return true;
  }),

  checkCertificationsPeriodIsRespected: (block, conf, dal) => co(function *() {
    let current = yield dal.getCurrentBlockOrNull();
    for (const obj of block.certifications) {
      let cert = Certification.statics.fromInline(obj);
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
    let current = yield dal.getCurrentBlockOrNull();
    for (const obj of block.identities) {
      let idty = Identity.statics.fromInline(obj);
      let found = yield dal.getWrittenIdtyByUID(idty.uid);
      if (found) {
        throw Error('Identity already used');
      }
      // Because the window rule does not apply on initial certifications
      if (current && idty.buid != constants.BLOCK.SPECIAL_BLOCK) {
        let basedBlock;
        if (block.version < 5) {
          // Prior to DUP 0.5: the full blockstamp was not chcked, only the number
          const blockNumber = idty.buid.split('-')[0];
          basedBlock = yield dal.getBlock(blockNumber);
        } else {
          // From DUP 0.5: we fully check the blockstamp
          basedBlock = yield dal.getBlockByBlockstamp(idty.buid);
        }
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
    let current = yield dal.getCurrentBlockOrNull();
    for (const obj of block.certifications) {
      let cert = Certification.statics.fromInline(obj);
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
    let current = yield dal.getCurrentBlockOrNull();
    let fields = ['joiners', 'actives', 'leavers'];
    for (const field of fields) {
      for (const obj of block[field]) {
        let ms = Membership.statics.fromInline(obj);
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
    for (const obj of block.identities) {
      let idty = Identity.statics.fromInline(obj);
      let found = yield dal.getWrittenIdtyByUID(idty.uid);
      if (found) {
        throw Error('Identity already used');
      }
    }
    return true;
  }),

  checkPubkeyUnicity: (block, conf, dal) => co(function *() {
    for (const obj of block.identities) {
      let idty = Identity.statics.fromInline(obj);
      let found = yield dal.getWrittenIdtyByPubkey(idty.pubkey);
      if (found) {
        throw Error('Pubkey already used');
      }
    }
    return true;
  }),

  checkJoiners: (block, conf, dal) => co(function *() {
    for (const obj of block.joiners) {
      let ms = Membership.statics.fromInline(obj);
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
    for (const obj of block.actives) {
      let ms = Membership.statics.fromInline(obj);
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
    for (const obj of block.leavers) {
      let ms = Membership.statics.fromInline(obj);
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
    for (const revoked of block.revoked) {
      let sp = revoked.split(':');
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
      let sigOK = keyring.verify(rawRevocation, sig, pubkey);
      if (!sigOK) {
        throw Error("Revocation signature must match");
      }
    }
    return true;
  }),

  checkExcluded: (block, conf, dal) => co(function *() {
    for (const pubkey of block.excluded) {
      let idty = yield dal.getWrittenIdtyByPubkey(pubkey);
      if (!idty) {
        throw Error("Cannot be in excluded if not a member");
      }
    }
    return true;
  }),

  checkJoinersHaveEnoughCertifications: (block, conf, dal) => co(function *() {
    if (block.number > 0) {
      const newLinks = getNewLinks(block);
      for (const obj of block.joiners) {
        let ms = Membership.statics.fromInline(obj);
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
    block.version,
    block.joiners.map((inlineMS) => Membership.statics.fromInline(inlineMS).issuer),
    getNewLinks(block),
    block.identities.map((inline) => Identity.statics.fromInline(inline).pubkey),
    conf, dal),

  checkActivesAreNotOudistanced: (block, conf, dal) => checkPeopleAreNotOudistanced(
    block.version,
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
    for (const obj of block.joiners) {
      let ms = Membership.statics.fromInline(obj);
      let idty = yield dal.getWrittenIdtyByPubkey(ms.issuer);
      if (idty && idty.revoked) {
        throw Error('Revoked pubkeys cannot join');
      }
    }
    return true;
  }),

  checkSourcesAvailability: (block, conf, dal, alsoCheckPendingTransactions) => co(function *() {
    let txs = block.getTransactions();
    const current = yield dal.getCurrentBlockOrNull();
    for (const tx of txs) {
      let unlocks = {};
      let sumOfInputs = 0;
      let maxOutputBase = current.unitbase;
      for (const unlock of tx.unlocks) {
        let sp = unlock.split(':');
        let index = parseInt(sp[0]);
        unlocks[index] = sp[1];
      }
      for (let k = 0, len2 = tx.inputs.length; k < len2; k++) {
        let src = tx.inputs[k];
        let dbSrc = yield dal.getSource(src.identifier, src.noffset);
        logger.debug('Source %s:%s = %s', src.identifier, src.noffset, dbSrc && dbSrc.consumed);
        if (!dbSrc && alsoCheckPendingTransactions) {
          // For chained transactions which are checked on sandbox submission, we accept them if there is already
          // a previous transaction of the chain already recorded in the pool
          dbSrc = yield co(function*() {
            let hypotheticSrc = null;
            let targetTX = yield dal.getTxByHash(src.identifier);
            if (targetTX) {
              let outputStr = targetTX.outputs[src.noffset];
              if (outputStr) {
                hypotheticSrc = Transaction.statics.outputStr2Obj(outputStr);
                hypotheticSrc.consumed = false;
                hypotheticSrc.time = 0;
              }
            }
            return hypotheticSrc;
          });
        }
        if (!dbSrc || dbSrc.consumed) {
          logger.warn('Source ' + [src.type, src.identifier, src.noffset].join(':') + ' is not available');
          throw constants.ERRORS.SOURCE_ALREADY_CONSUMED;
        }
        sumOfInputs += dbSrc.amount * Math.pow(10, dbSrc.base);
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
            for (const func of sp) {
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
        if (output.base > maxOutputBase) {
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
  }),

  checkTransactionsBlockStamp: (block, conf, dal) => co(function *() {
    for(const tx of block.getTransactions()) {
      yield rules.HELPERS.checkTxBlockStamp(tx, dal);
    }
    return true;
  })
};

rules.HELPERS = {

  // Functions used in an external context too
  checkMembershipBlock: (ms, current, conf, dal) => checkMSTarget(ms, current ? { number: current.number + 1} : { number: 0 }, conf, dal),

  checkCertificationIsValid: (cert, current, findIdtyFunc, conf, dal) => checkCertificationIsValid(current ? current : { number: 0 }, cert, findIdtyFunc, conf, dal),

  checkCertificationIsValidForBlock: (cert, block, idty, conf, dal) => checkCertificationIsValid(block, cert, () => idty, conf, dal),

  isOver3Hops: (version, member, newLinks, newcomers, current, conf, dal) => co(function *() {
    if (!current) {
      return Q(false);
    }
    try {
      yield checkPeopleAreNotOudistanced(version, [member], newLinks, newcomers, conf, dal);
      return false;
    } catch (e) {
      return true;
    }
  }),

  checkExistsUserID: (uid, dal) => dal.getWrittenIdtyByUID(uid),

  checkExistsPubkey: (pub, dal) => dal.getWrittenIdtyByPubkey(pub),

  checkSingleTransaction: (tx, block, conf, dal, alsoCheckPendingTransactions) => rules.FUNCTIONS.checkSourcesAvailability({
    getTransactions: () => [tx],
    medianTime: block.medianTime
  }, conf, dal, alsoCheckPendingTransactions),

  checkTxBlockStamp: (tx, dal) => co(function *() {
    if (tx.version >= 3) {
      const number = tx.blockstamp.split('-')[0];
      const hash = tx.blockstamp.split('-')[1];
      const basedBlock = yield dal.getBlockByNumberAndHashOrNull(number, hash);
      if (!basedBlock) {
        throw "Wrong blockstamp for transaction";
      }
      // Valuates the blockstampTime field
      tx.blockstampTime = basedBlock.medianTime;
      const current = yield dal.getCurrentBlockOrNull();
      if (current && current.medianTime > basedBlock.medianTime + constants.TRANSACTION_EXPIRY_DELAY) {
        throw "Transaction has expired";
      }
    }
  })
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
      let current = yield dal.getCurrentBlockOrNull();
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
      let current = block.number == 0 ? null : yield dal.getCurrentBlockOrNull();
      if (!idty) {
        throw Error('Identity does not exist for certified');
      }
      else if (current && current.medianTime > basedBlock.medianTime + conf.sigValidity) {
        throw Error('Certification has expired');
      }
      else if (cert.from == idty.pubkey)
        throw Error('Rejected certification: certifying its own self-certification has no meaning');
      else {
        const buid = [cert.block_number, basedBlock.hash].join('-');
        if (cert.block_hash && buid != [cert.block_number, cert.block_hash].join('-'))
          throw Error('Certification based on an unexisting block buid. from ' + cert.from.substring(0,8) + ' to ' + idty.pubkey.substring(0,8));
        idty.currency = conf.currency;
        const raw = rawer.getOfficialCertification(_.extend(idty, {
          idty_issuer: idty.pubkey,
          idty_uid: idty.uid,
          idty_buid: idty.buid,
          idty_sig: idty.sig,
          issuer: cert.from,
          buid: buid,
          sig: ''
        }));
        const verified = keyring.verify(raw, cert.sig, cert.from);
        if (!verified) {
          throw Error('Wrong signature for certification');
        }
        return true;
      }
    }
  });
}

function checkPeopleAreNotOudistanced (version, pubkeys, newLinks, newcomers, conf, dal) {
  return co(function *() {
    let wotb = dal.wotb;
    let current = yield dal.getCurrentBlockOrNull();
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
    for (const toKey of toKeys) {
      let toNode = yield getNodeIDfromPubkey(nodesCache, toKey, dal);
      for (const fromKey of newLinks[toKey]) {
        let fromNode = yield getNodeIDfromPubkey(nodesCache, fromKey, dal);
        tempLinks.push({ from: fromNode, to: toNode });
      }
    }
    tempLinks.forEach((link) => wotb.addLink(link.from, link.to));
    // Checking distance of each member against them
    let error;
    for (const pubkey of pubkeys) {
      let nodeID = yield getNodeIDfromPubkey(nodesCache, pubkey, dal);
      let dSen;
      if (version <= 3) {
        dSen = Math.ceil(constants.CONTRACT.DSEN_P * Math.exp(Math.log(membersCount) / conf.stepMax));
      } else {
        dSen = Math.ceil(Math.pow(membersCount, 1 / conf.stepMax));
      }
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

function getNewLinks (block) {
  const newLinks = {};
  block.certifications.forEach(function(inlineCert){
    const cert = Certification.statics.fromInline(inlineCert);
    newLinks[cert.to] = newLinks[cert.to] || [];
    newLinks[cert.to].push(cert.from);
  });
  return newLinks;
}

module.exports = rules;
