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

rules.FUNCTIONS = {

  checkVersion: (block, dal) => co(function *() {
    let current = yield dal.getCurrentBlockOrNull();
    if (current && current.version > 2 && block.version == 2) {
      throw Error('`Version: 2` must follow another V2 block or be the root block');
    }
    else if (block.version > 2) {
      if (current && current.version != (block.version - 1) && current.version != block.version) {
        throw Error('`Version: ' + block.version + '` must follow another V' + block.version + ' block, a V' + (block.version - 1) + ' block or be the root block');
      }
    }
    return true;
  }),

  checkBlockLength: (block, dal) => co(function *() {
    if (block.len > 500) {
      const maxSize = yield rules.HELPERS.getMaxBlockSize(dal);
      if (block.len > maxSize) {
        throw Error('Block size is too high');
      }
    } else {
      // There is no problem with blocks <= 500 lines
      return true;
    }
  }),

  checkNumber: (block, dal) => co(function *() {
    let current = yield dal.getCurrentBlockOrNull();
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
      let correctPowMin = yield getPoWMinFor(block.version, block.number, conf, dal);
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
    let difficulty = yield getTrialLevel(block.version, block.issuer, conf, dal);
    const remainder = difficulty % 16;
    const nbZerosReq = Math.max(0, (difficulty - remainder) / 16);
    const highMark = constants.PROOF_OF_WORK.UPPER_BOUND[remainder];
    const powRegexp = new RegExp('^0{' + nbZerosReq + '}' + '[0-' + highMark + ']');
    if (!block.hash.match(powRegexp)) {
      const givenZeros = Math.max(0, Math.min(nbZerosReq, block.hash.match(/^0*/)[0].length));
      const c = block.hash.substr(givenZeros, 1);
      throw Error('Wrong proof-of-work level: given ' + givenZeros + ' zeros and \'' + c + '\', required was ' + nbZerosReq + ' zeros and an hexa char between [0-' + highMark + ']');
    }
    return true;
  }),

  checkUD: (block, conf, dal) => co(function *() {
    let current = yield dal.getCurrentBlockOrNull();
    let nextUD = yield rules.HELPERS.getNextUD(dal, conf, block.version, block.medianTime, current, block.membersCount);
    if (!current && block.dividend) {
      throw Error('Root block cannot have UniversalDividend field');
    }
    else if (current && nextUD && !block.dividend) {
      throw Error('Block must have a UniversalDividend field');
    }
    else if (current && nextUD && block.dividend != nextUD.dividend) {
      throw Error('UniversalDividend must be equal to ' + nextUD.dividend);
    }
    else if (current && !nextUD && block.dividend) {
      throw Error('This block cannot have UniversalDividend');
    }
    else if (current && nextUD && block.unitbase != nextUD.unitbase) {
      throw Error('UnitBase must be equal to ' + nextUD.unitbase);
    }
    else if (block.version > 2 && current && !nextUD && block.unitbase != current.unitbase) {
      throw Error('UnitBase must be equal to previous unit base = ' + current.unitbase);
    }
    return true;
  }),

  checkPreviousHash: (block, dal) => co(function *() {
    let current = yield dal.getCurrentBlockOrNull();
    if (current && block.previousHash != current.hash) {
      throw Error('PreviousHash not matching hash of current block');
    }
    return true;
  }),

  checkPreviousIssuer: (block, dal) => co(function *() {
    let current = yield dal.getCurrentBlockOrNull();
    if (current && block.previousIssuer != current.issuer) {
      throw Error('PreviousIssuer not matching issuer of current block');
    }
    return true;
  }),

  checkMembersCountIsGood: (block, dal) => co(function *() {
    let current = yield dal.getCurrentBlockOrNull();
    const currentCount = current ? current.membersCount : 0;
    const constiation = block.joiners.length - block.excluded.length;
    if (block.membersCount != currentCount + constiation) {
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

  checkDifferentIssuersCount: (block, conf, dal) => co(function *() {
    if (block.version > 2) {
      const isGood = block.issuersCount == (yield rules.HELPERS.getDifferentIssuers(dal));
      if (!isGood) {
        throw Error('DifferentIssuersCount is not correct');
      }
      return isGood;
    }
  }),

  checkIssuersFrame: (block, conf, dal) => co(function *() {
    if (block.version > 2) {
      const isGood = block.issuersFrame == (yield rules.HELPERS.getIssuersFrame(dal));
      if (!isGood) {
        throw Error('IssuersFrame is not correct');
      }
      return isGood;
    }
  }),

  checkIssuersFrameVar: (block, conf, dal) => co(function *() {
    if (block.version > 2) {
      const isGood = block.issuersFrameVar == (yield rules.HELPERS.getIssuersFrameVar(block, dal));
      if (!isGood) {
        throw Error('IssuersFrameVar is not correct');
      }
      return isGood;
    }
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

  getTrialLevel: (version, issuer, conf, dal) => getTrialLevel(version, issuer, conf, dal),

  getPoWMin: (version, blockNumber, conf, dal) => getPoWMinFor(version, blockNumber, conf, dal),

  getMedianTime: (blockNumber, conf, dal) => getMedianTime(blockNumber, conf, dal),

  checkExistsUserID: (uid, dal) => dal.getWrittenIdtyByUID(uid),

  checkExistsPubkey: (pub, dal) => dal.getWrittenIdtyByPubkey(pub),

  checkSingleTransaction: (tx, block, conf, dal, alsoCheckPendingTransactions) => rules.FUNCTIONS.checkSourcesAvailability({
    getTransactions: () => [tx],
    medianTime: block.medianTime
  }, conf, dal, alsoCheckPendingTransactions),

  getNextUD: (dal, conf, version, nextMedianTime, current, nextN) => co(function *() {
    const lastUDBlock = yield dal.lastUDBlock();
    let lastUDTime = lastUDBlock && lastUDBlock.UDTime;
    if (!lastUDTime) {
      const rootBlock = yield dal.getBlock(0);
      lastUDTime = (rootBlock != null ? rootBlock.medianTime : 0);
    }
    if (lastUDTime == null) {
      return null;
    }
    if (!current) {
      return null;
    }
    if (lastUDTime + conf.dt <= nextMedianTime) {
      const M = lastUDBlock ? lastUDBlock.monetaryMass : current.monetaryMass || 0;
      const c = conf.c;
      const N = nextN;
      const previousUD = lastUDBlock ? lastUDBlock.dividend : conf.ud0;
      const previousUB = lastUDBlock ? lastUDBlock.unitbase : constants.FIRST_UNIT_BASE;
      if (version == 2) {
        if (N > 0) {
          const block = {
            dividend: Math.ceil(Math.max(previousUD, c * M / Math.pow(10, previousUB) / N)),
            unitbase: previousUB
          };
          if (block.dividend >= Math.pow(10, constants.NB_DIGITS_UD)) {
            block.dividend = Math.ceil(block.dividend / 10.0);
            block.unitbase++;
          }
          return block;
        } else {
          // The community has collapsed. RIP.
          return null;
        }
      } else {
        const block = {
          unitbase: previousUB
        };
        if (version == 3) {
          block.dividend = parseInt(((1 + c) * previousUD).toFixed(0));
        } else {
          if (N > 0) {
            block.dividend = parseInt((previousUD + Math.pow(c, 2) * (M / N) / Math.pow(10, previousUB)).toFixed(0));
          } else {
            // The community has collapsed. RIP.
            return null;
          }
        }
        if (block.dividend >= Math.pow(10, constants.NB_DIGITS_UD)) {
          block.dividend = Math.ceil(block.dividend / 10.0);
          block.unitbase++;
        }
        return block;
      }
    }
    return null;
  }),

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
  }),

  getDifferentIssuers: (dal) => co(function *() {
    const current = yield dal.getCurrentBlockOrNull();
    let frameSize = 0;
    let currentNumber = 0;
    if (current) {
      currentNumber = current.number;
      if (current.version == 2) {
        frameSize = 40;
      } else {
        frameSize = current.issuersFrame;
      }
    }
    const blocksBetween = yield dal.getBlocksBetween(Math.max(0, currentNumber - frameSize + 1), currentNumber);
    const issuers = _.pluck(blocksBetween, 'issuer');
    return _.uniq(issuers).length;
  }),

  getIssuersFrame: (dal) => co(function *() {
    const current = yield dal.getCurrentBlockOrNull();
    let frame = 1;
    if (!current) {
      frame = 1;
    }
    else {
      if (current.version == 2) {
        frame = 40;
      }
      else if (current.version > 2) {
        frame = current.issuersFrame;
        // CONVERGENCE
        if (current.issuersFrameVar > 0) {
          frame++;
        }
        if (current.issuersFrameVar < 0) {
          frame--;
        }
      }
    }
    return frame;
  }),

  getIssuersFrameVar: (block, dal) => co(function *() {
    const current = yield dal.getCurrentBlockOrNull();
    let frameVar = 0;
    if (current && current.version > 2) {
      frameVar = current.issuersFrameVar;
      // CONVERGENCE
      if (current.issuersFrameVar > 0) {
        frameVar--;
      }
      if (current.issuersFrameVar < 0) {
        frameVar++;
      }
      // NEW_ISSUER_INC
      if (current.issuersCount < block.issuersCount) {
        frameVar += 5;
      }
      // GONE_ISSUER_DEC
      if (current.issuersCount > block.issuersCount) {
        frameVar -= 5;
      }
    }
    return frameVar;
  }),

  getMaxBlockSize: (dal) => co(function *() {
    const current = yield dal.getCurrentBlockOrNull();
    const start = current ? current.number - current.issuersCount : 0;
    const end = current ? current.number : 0;
    const blocks = yield dal.getBlocksBetween(start, end);
    const avgSize = blocks.length ? blocks.reduce((lenSum, b) => lenSum + b.len, 0) / blocks.length : 0;
    const maxSize = Math.ceil(1.1 * avgSize);
    return Math.max(500, maxSize);
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

function getTrialLevel (version, issuer, conf, dal) {
  return co(function *() {
    if (version == 2) {
      // Compute exactly how much zeros are required for this block's issuer
      let percentRot = conf.percentRot;
      let current = yield dal.getCurrentBlockOrNull();
      if (!current) {
        return conf.powMin || 0;
      }
      let last = yield dal.lastBlockOfIssuer(issuer);
      let powMin = yield getPoWMinFor(version, current.number + 1, conf, dal);
      let issuers = [];
      if (last) {
        let blocksBetween = yield dal.getBlocksBetween(last.number - 1 - conf.blocksRot, last.number - 1);
        issuers = _.pluck(blocksBetween, 'issuer');
      } else {
        // So we can have nbPreviousIssuers = 0 & nbBlocksSince = 0 for someone who has never written any block
        last = { number: current.number };
      }
      const nbPreviousIssuers = _(_(issuers).uniq()).without(issuer).length;
      const nbBlocksSince = current.number - last.number;
      let personal_diff = Math.max(powMin, powMin * Math.floor(percentRot * (1 + nbPreviousIssuers) / (1 + nbBlocksSince)));
      if (personal_diff + 1 % 16 == 0) {
        personal_diff++;
      }
      return personal_diff;
    } else if (version > 2 && version < 5) {
      // Compute exactly how much zeros are required for this block's issuer
      let percentRot = conf.percentRot;
      let current = yield dal.getCurrentBlockOrNull();
      if (!current) {
        return conf.powMin || 0;
      }
      let last = yield dal.lastBlockOfIssuer(issuer);
      let powMin = yield getPoWMinFor(version, current.number + 1, conf, dal);
      let nbPreviousIssuers = 0;
      if (last) {
        nbPreviousIssuers = last.issuersCount;
      } else {
        // So we have nbBlocksSince = 0 for someone who has never written any block
        last = { number: current.number };
      }
      const nbBlocksSince = current.number - last.number;
      let personal_diff = Math.max(powMin, powMin * Math.floor(percentRot * nbPreviousIssuers / (1 + nbBlocksSince)));
      if (version > 3) {
        const from = current.number - current.issuersFrame + 1;
        const nbBlocksIssuedInFrame = yield dal.getNbIssuedInFrame(issuer, from);
        const personal_excess = Math.max(0, (nbBlocksIssuedInFrame / 5) - 1);
        // Personal_handicap
        personal_diff += Math.floor(Math.log(1 + personal_excess) / Math.log(1.189));
      }
      if (personal_diff + 1 % 16 == 0) {
        personal_diff++;
      }
      return personal_diff;
    } else {
      // NB: no more use conf.percentRot
      // Compute exactly how much zeros are required for this block's issuer
      let current = yield dal.getCurrentBlockOrNull();
      if (!current) {
        return conf.powMin || 0;
      }
      let powMin = yield getPoWMinFor(version, current.number + 1, conf, dal);
      let blocksBetween = [];
      if (current) {
        blocksBetween = yield dal.getBlocksBetween(current.number - current.issuersFrame + 1, current.number);
      }
      const blocksByIssuer = blocksBetween.reduce((oMap, block) => {
        oMap[block.issuer] = oMap[block.issuer] || 0;
        oMap[block.issuer]++;
        return oMap;
      }, {});
      const counts = Object.values(blocksByIssuer);
      let medianOfIssuedBlocks = null;
      counts.sort((a, b) => a < b ? -1 : (a > b ? 1 : 0));
      const nbIssuers = counts.length;
      if (nbIssuers % 2 === 0) {
        // Even number of nodes: the median is the average between the 2 central values
        const firstValue = counts[nbIssuers / 2];
        const secondValue = counts[nbIssuers / 2 - 1];
        medianOfIssuedBlocks = (firstValue + secondValue) / 2;
      } else {
        medianOfIssuedBlocks = counts[(nbIssuers + 1) / 2 - 1];
      }

      const from = current.number - current.issuersFrame + 1;
      const nbBlocksIssuedInFrame = yield dal.getNbIssuedInFrame(issuer, from);
      const personal_excess = Math.max(0, ((nbBlocksIssuedInFrame + 1)/ medianOfIssuedBlocks) - 1);
      // Personal_handicap
      const handicap = Math.floor(Math.log(1 + personal_excess) / Math.log(1.189));
      let personal_diff = powMin + handicap;
      if (personal_diff + 1 % 16 == 0) {
        personal_diff++;
      }
      return personal_diff;
    }
  });
}

/**
 * Deduce the PoWMin field for a given block number
 */
function getPoWMinFor (blockVersion, blockNumber, conf, dal) {
  return Q.Promise(function(resolve, reject){
    if (blockNumber == 0) {
      reject('Cannot deduce PoWMin for block#0');
    } else if (blockNumber % conf.dtDiffEval != 0) {
      co(function *() {
        const previous = yield dal.getBlock(blockNumber - 1);
        return previous.powMin;
      })
        .then(resolve)
        .catch(function(err) {
          reject(err);
          throw err;
        });
    } else {
      co(function *() {
        const previous = yield dal.getBlock(blockNumber - 1);
        const medianTime = yield getMedianTime(blockNumber, conf, dal);
        const speedRange = Math.min(conf.dtDiffEval, blockNumber);
        const lastDistant = yield dal.getBlock(Math.max(0, blockNumber - speedRange));
        // Compute PoWMin value
        const duration = medianTime - lastDistant.medianTime;
        const speed = speedRange / duration;
        const ratio = blockVersion > 3 ? constants.POW_DIFFICULTY_RANGE_RATIO_V4 : constants.POW_DIFFICULTY_RANGE_RATIO_V3;
        const maxGenTime = Math.ceil(conf.avgGenTime * ratio);
        const minGenTime = Math.floor(conf.avgGenTime / ratio);
        const maxSpeed = 1.0 / minGenTime;
        const minSpeed = 1.0 / maxGenTime;
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
    for (const timeValue of timeValues) {
      sum += timeValue;
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
  const newLinks = {};
  block.certifications.forEach(function(inlineCert){
    const cert = Certification.statics.fromInline(inlineCert);
    newLinks[cert.to] = newLinks[cert.to] || [];
    newLinks[cert.to].push(cert.from);
  });
  return newLinks;
}

module.exports = rules;
