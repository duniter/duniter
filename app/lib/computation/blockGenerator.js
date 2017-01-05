"use strict";
const _               = require('underscore');
const co              = require('co');
const Q               = require('q');
const moment          = require('moment');
const inquirer        = require('inquirer');
const indexer         = require('../dup/indexer');
const rawer           = require('../ucp/rawer');
const hashf           = require('../ucp/hashf');
const constants       = require('../constants');
const base58          = require('../crypto/base58');
const rules           = require('../rules/index');
const keyring          = require('../crypto/keyring');
const Identity        = require('../entity/identity');
const Certification   = require('../entity/certification');
const Membership      = require('../entity/membership');
const Block           = require('../entity/block');
const Transaction     = require('../entity/transaction');

module.exports = (mainContext, prover) => {
  return new BlockGenerator(mainContext, prover);
};

function BlockGenerator(mainContext, prover) {

  const that = this;
  let conf, dal, keyPair, selfPubkey, logger;

  this.setConfDAL = (newConf, newDAL, newKeyPair) => {
    dal = newDAL;
    conf = newConf;
    keyPair = newKeyPair;
    selfPubkey = newKeyPair.publicKey;
    logger = require('../logger')(dal.profile);
  };

  this.nextBlock = (manualValues) => generateNextBlock(new NextBlockGenerator(mainContext, conf, dal), manualValues);

  this.manualRoot = () => co(function *() {
    let current = yield dal.getCurrentBlockOrNull();
    if (current) {
      throw 'Cannot generate root block: it already exists.';
    }
    return generateNextBlock(new ManualRootGenerator());
  });

  this.makeNextBlock = (block, trial, manualValues) => co(function *() {
    const unsignedBlock = block || (yield that.nextBlock(manualValues));
    const trialLevel = trial || (yield mainContext.getIssuerPersonalizedDifficulty(selfPubkey));
    return prover.prove(unsignedBlock, trialLevel, (manualValues && manualValues.time) || null);
  });

  /**
   * Generate next block, gathering both updates & newcomers
   */
  const generateNextBlock = (generator, manualValues) => co(function *() {
    const current = yield dal.getCurrentBlockOrNull();
    const revocations = yield dal.getRevocatingMembers();
    const exclusions = yield dal.getToBeKickedPubkeys();
    const newCertsFromWoT = yield generator.findNewCertsFromWoT(current);
    const newcomersLeavers = yield findNewcomersAndLeavers(current, generator.filterJoiners);
    const transactions = yield findTransactions(current);
    const joinData = newcomersLeavers[2];
    const leaveData = newcomersLeavers[3];
    const newCertsFromNewcomers = newcomersLeavers[4];
    const certifiersOfNewcomers = _.uniq(_.keys(joinData).reduce((certifiers, newcomer) => {
      return certifiers.concat(_.pluck(joinData[newcomer].certs, 'from'));
    }, []));
    const certifiers = [].concat(certifiersOfNewcomers);
    // Merges updates
    _(newCertsFromWoT).keys().forEach(function(certified){
      newCertsFromWoT[certified] = newCertsFromWoT[certified].filter((cert) => {
        // Must not certify a newcomer, since it would mean multiple certifications at same time from one member
        const isCertifier = certifiers.indexOf(cert.from) != -1;
        if (!isCertifier) {
          certifiers.push(cert.from);
        }
        return !isCertifier;
      });
    });
    _(newCertsFromNewcomers).keys().forEach((certified) => {
      newCertsFromWoT[certified] = (newCertsFromWoT[certified] || []).concat(newCertsFromNewcomers[certified]);
    });
    // Revocations
    // Create the block
    return createBlock(current, joinData, leaveData, newCertsFromWoT, revocations, exclusions, transactions, manualValues);
  });

  const findNewcomersAndLeavers  = (current, filteringFunc) => co(function*() {
    const newcomers = yield findNewcomers(current, filteringFunc);
    const leavers = yield findLeavers(current);

    const cur = newcomers.current;
    const newWoTMembers = newcomers.newWotMembers;
    const finalJoinData = newcomers.finalJoinData;
    const updates = newcomers.updates;

    return [cur, newWoTMembers, finalJoinData, leavers, updates];
  });

  const findTransactions = (current) => co(function*() {
    const versionMin = current ? Math.min(constants.LAST_VERSION_FOR_TX, current.version) : constants.DOCUMENTS_VERSION;
    const txs = yield dal.getTransactionsPending(versionMin);
    const transactions = [];
    const passingTxs = [];
    for (const obj of txs) {
      const tx = new Transaction(obj, conf.currency);
      const extractedTX = tx.getTransaction();
      try {
        yield Q.nbind(rules.HELPERS.checkBunchOfTransactions, rules, passingTxs.concat(extractedTX));
        const nextBlockWithFakeTimeVariation = { medianTime: current.medianTime + 1 };
        yield rules.HELPERS.checkSingleTransaction(extractedTX, nextBlockWithFakeTimeVariation, conf, dal);
        yield rules.HELPERS.checkTxBlockStamp(extractedTX, dal);
        transactions.push(tx);
        passingTxs.push(extractedTX);
        logger.info('Transaction %s added to block', tx.hash);
      } catch (err) {
        logger.error(err);
        const currentNumber = (current && current.number) || 0;
        const blockstamp = extractedTX.blockstamp || (currentNumber + '-');
        const txBlockNumber = parseInt(blockstamp.split('-')[0]);
        // 10 blocks before removing the transaction
        if (currentNumber - txBlockNumber + 1 >= constants.TRANSACTION_MAX_TRIES) {
          yield dal.removeTxByHash(extractedTX.hash);
        }
      }
    }
    return transactions;
  });

  const findLeavers = (current) => co(function*() {
    const leaveData = {};
    const memberships = yield dal.findLeavers();
    const leavers = [];
    memberships.forEach((ms) => leavers.push(ms.issuer));
    for (const ms of memberships) {
      const leave = { identity: null, ms: ms, key: null, idHash: '' };
      leave.idHash = (hashf(ms.userid + ms.certts + ms.issuer) + "").toUpperCase();
      let block;
      if (current) {
        block = yield dal.getBlock(ms.number);
      }
      else {
        block = {};
      }
      const identity = yield dal.getIdentityByHashOrNull(leave.idHash);
      const currentMembership = yield dal.mindexDAL.getReducedMS(ms.issuer);
      const currentMSN = currentMembership ? parseInt(currentMembership.created_on) : -1;
      if (identity && block && currentMSN < leave.ms.number && identity.member) {
        // MS + matching cert are found
        leave.identity = identity;
        leaveData[identity.pubkey] = leave;
      }
    }
    return leaveData;
  });

  const findNewcomers = (current, filteringFunc) => co(function*() {
    const updates = {};
    const preJoinData = yield getPreJoinData(current);
    const joinData = yield filteringFunc(preJoinData);
    const members = yield dal.getMembers();
    const wotMembers = _.pluck(members, 'pubkey');
    // Checking step
    const newcomers = _(joinData).keys();
    const nextBlockNumber = current ? current.number + 1 : 0;
    try {
      const realNewcomers = yield iteratedChecking(newcomers, (someNewcomers) => co(function*() {
        const nextBlock = {
          number: nextBlockNumber,
          joiners: someNewcomers,
          identities: _.filter(newcomers.map((pub) => joinData[pub].identity), { wasMember: false }).map((idty) => idty.pubkey)
        };
        const newLinks = yield computeNewLinks(nextBlockNumber, someNewcomers, joinData, updates);
        yield checkWoTConstraints(nextBlock, newLinks, current);
      }));
      const newLinks = yield computeNewLinks(nextBlockNumber, realNewcomers, joinData, updates);
      const newWoT = wotMembers.concat(realNewcomers);
      const finalJoinData = {};
      realNewcomers.forEach((newcomer) => {
        // Only keep membership of selected newcomers
        finalJoinData[newcomer] = joinData[newcomer];
        // Only keep certifications from final members
        const keptCerts = [];
        joinData[newcomer].certs.forEach((cert) => {
          const issuer = cert.from;
          if (~newWoT.indexOf(issuer) && ~newLinks[cert.to].indexOf(issuer)) {
            keptCerts.push(cert);
          }
        });
        joinData[newcomer].certs = keptCerts;
      });
      return {
        current: current,
        newWotMembers: wotMembers.concat(realNewcomers),
        finalJoinData: finalJoinData,
        updates: updates
      }
    } catch(err) {
      logger.error(err);
      throw err;
    }
  });

  const checkWoTConstraints = (block, newLinks, current) => co(function*() {
    if (block.number < 0) {
      throw 'Cannot compute WoT constraint for negative block number';
    }
    const newcomers = block.joiners.map((inlineMS) => inlineMS.split(':')[0]);
    const realNewcomers = block.identities;
    for (const newcomer of newcomers) {
      if (block.number > 0) {
        try {
          // Will throw an error if not enough links
          yield mainContext.checkHaveEnoughLinks(newcomer, newLinks);
          // This one does not throw but returns a boolean
          const isOut = yield rules.HELPERS.isOver3Hops(newcomer, newLinks, realNewcomers, current, conf, dal);
          if (isOut) {
            throw 'Key ' + newcomer + ' is not recognized by the WoT for this block';
          }
        } catch (e) {
          logger.debug(e);
          throw e;
        }
      }
    }
  });

  const iteratedChecking = (newcomers, checkWoTForNewcomers) => co(function*() {
    const passingNewcomers = [];
    let hadError = false;
    for (const newcomer of newcomers) {
      try {
        yield checkWoTForNewcomers(passingNewcomers.concat(newcomer));
        passingNewcomers.push(newcomer);
      } catch (err) {
        hadError = hadError || err;
      }
    }
    if (hadError) {
      return yield iteratedChecking(passingNewcomers, checkWoTForNewcomers);
    } else {
      return passingNewcomers;
    }
  });

  const getPreJoinData = (current) => co(function*() {
    const preJoinData = {};
    const memberships = yield dal.findNewcomers();
    const joiners = [];
    memberships.forEach((ms) =>joiners.push(ms.issuer));
    for (const ms of memberships) {
      try {
        if (ms.block != constants.BLOCK.SPECIAL_BLOCK) {
          let msBasedBlock = yield dal.getBlockByBlockstampOrNull(ms.block);
          if (!msBasedBlock) {
            throw constants.ERRORS.BLOCKSTAMP_DOES_NOT_MATCH_A_BLOCK;
          }
          let age = current.medianTime - msBasedBlock.medianTime;
          if (age > conf.msWindow) {
            throw constants.ERRORS.TOO_OLD_MEMBERSHIP;
          }
        }
        const idtyHash = (hashf(ms.userid + ms.certts + ms.issuer) + "").toUpperCase();
        const join = yield that.getSinglePreJoinData(current, idtyHash, joiners);
        join.ms = ms;
        const currentMembership = yield dal.mindexDAL.getReducedMS(ms.issuer);
        const currentMSN = currentMembership ? parseInt(currentMembership.created_on) : -1;
        if (!join.identity.revoked && currentMSN < parseInt(join.ms.number)) {
          preJoinData[join.identity.pubkey] = join;
        }
      } catch (err) {
        if (err && !err.uerr) {
          logger.warn(err);
        }
      }
    }
    return preJoinData;
  });

  const computeNewLinks = (forBlock, theNewcomers, joinData, updates) => co(function *() {
    let newCerts = yield that.computeNewCerts(forBlock, theNewcomers, joinData);
    return that.newCertsToLinks(newCerts, updates);
  });

  this.newCertsToLinks = (newCerts, updates) => {
    let newLinks = {};
    _.mapObject(newCerts, function(certs, pubkey) {
      newLinks[pubkey] = _.pluck(certs, 'from');
    });
    _.mapObject(updates, function(certs, pubkey) {
      newLinks[pubkey] = (newLinks[pubkey] || []).concat(_.pluck(certs, 'pubkey'));
    });
    return newLinks;
  };

  this.computeNewCerts = (forBlock, theNewcomers, joinData) => co(function *() {
    const newCerts = {}, certifiers = [];
    const certsByKey = _.mapObject(joinData, function(val){ return val.certs; });
    for (const newcomer of theNewcomers) {
      // New array of certifiers
      newCerts[newcomer] = newCerts[newcomer] || [];
      // Check wether each certification of the block is from valid newcomer/member
      for (const cert of certsByKey[newcomer]) {
        const isAlreadyCertifying = certifiers.indexOf(cert.from) !== -1;
        if (!(isAlreadyCertifying && forBlock > 0)) {
          if (~theNewcomers.indexOf(cert.from)) {
            // Newcomer to newcomer => valid link
            newCerts[newcomer].push(cert);
            certifiers.push(cert.from);
          } else {
            let isMember = yield dal.isMember(cert.from);
            // Member to newcomer => valid link
            if (isMember) {
              newCerts[newcomer].push(cert);
              certifiers.push(cert.from);
            }
          }
        }
      }
    }
    return newCerts;
  });

  this.getSinglePreJoinData = (current, idHash, joiners) => co(function *() {
    const identity = yield dal.getIdentityByHashOrNull(idHash);
    let foundCerts = [];
    const vHEAD_1 = yield mainContext.getvHEAD_1();
    if (!identity) {
      throw 'Identity with hash \'' + idHash + '\' not found';
    }
    if (current && identity.buid == constants.BLOCK.SPECIAL_BLOCK && !identity.wasMember) {
      throw constants.ERRORS.TOO_OLD_IDENTITY;
    }
    else if (!identity.wasMember && identity.buid != constants.BLOCK.SPECIAL_BLOCK) {
      const idtyBasedBlock = yield dal.getBlock(identity.buid);
      const age = current.medianTime - idtyBasedBlock.medianTime;
      if (age > conf.idtyWindow) {
        throw constants.ERRORS.TOO_OLD_IDENTITY;
      }
    }
    const idty = new Identity(identity);
    idty.currency = conf.currency;
    const createIdentity = idty.rawWithoutSig();
    const verified = keyring.verify(createIdentity, idty.sig, idty.pubkey);
    if (!verified) {
      throw constants.ERRORS.IDENTITY_WRONGLY_SIGNED;
    }
    const isIdentityLeaving = yield dal.isLeaving(idty.pubkey);
    if (!isIdentityLeaving) {
      if (!current) {
        // Look for certifications from initial joiners
        // TODO: check if this is still working
        const certs = yield dal.certsNotLinkedToTarget(idHash);
        foundCerts = _.filter(certs, function(cert){
          // Add 'joiners && ': special case when block#0 not written ANd not joiner yet (avoid undefined error)
          return joiners && ~joiners.indexOf(cert.from);
        });
      } else {
        // Look for certifications from WoT members
        let certs = yield dal.certsNotLinkedToTarget(idHash);
        const certifiers = [];
        for (const cert of certs) {
          try {
            const basedBlock = yield dal.getBlock(cert.block_number);
            if (!basedBlock) {
              throw 'Unknown timestamp block for identity';
            }
            if (current) {
              const age = current.medianTime - basedBlock.medianTime;
              if (age > conf.sigWindow || age > conf.sigValidity) {
                throw 'Too old certification';
              }
            }
            // Already exists a link not replayable yet?
            let exists = yield dal.existsNonReplayableLink(cert.from, cert.to);
            if (exists) {
              throw 'It already exists a similar certification written, which is not replayable yet';
            }
            // Already exists a link not chainable yet?
            exists = yield dal.existsNonChainableLink(cert.from, vHEAD_1, conf.sigStock);
            if (exists) {
              throw 'It already exists a certification written which is not chainable yet';
            }
            const isMember = yield dal.isMember(cert.from);
            const doubleSignature = ~certifiers.indexOf(cert.from) ? true : false;
            if (isMember && !doubleSignature) {
              const isValid = yield rules.HELPERS.checkCertificationIsValidForBlock(cert, { number: current.number + 1, currency: current.currency }, identity, conf, dal);
              if (isValid) {
                certifiers.push(cert.from);
                foundCerts.push(cert);
              }
            }
          } catch (e) {
            logger.warn(e.stack || e.message || e);
            // Go on
          }
        }
      }
    }
    return {
      identity: identity,
      key: null,
      idHash: idHash,
      certs: foundCerts
    };
  });

  const createBlock = (current, joinData, leaveData, updates, revocations, exclusions, transactions, manualValues) => {
    return co(function *() {

      const vHEAD = yield mainContext.getvHeadCopy();
      const vHEAD_1 = yield mainContext.getvHEAD_1();
      const maxLenOfBlock = indexer.DUP_HELPERS.getMaxBlockSize(vHEAD);
      let blockLen = 0;
      // Revocations have an impact on exclusions
      revocations.forEach((idty) => exclusions.push(idty.pubkey));
      // Prevent writing joins/updates for excluded members
      exclusions = _.uniq(exclusions);
      exclusions.forEach((excluded) => {
        delete updates[excluded];
        delete joinData[excluded];
        delete leaveData[excluded];
      });
      _(leaveData).keys().forEach((leaver) => {
        delete updates[leaver];
        delete joinData[leaver];
      });
      const block = new Block();
      block.number = current ? current.number + 1 : 0;
      // Compute the new MedianTime
      if (block.number == 0) {
        block.medianTime = moment.utc().unix() - conf.rootoffset;
      }
      else {
        block.medianTime = vHEAD.medianTime;
      }
      // Choose the version
      block.version = (manualValues && manualValues.version) || (yield rules.HELPERS.getMaxPossibleVersionNumber(current, block));
      block.currency = current ? current.currency : conf.currency;
      block.nonce = 0;
      block.parameters = block.number > 0 ? '' : [
        conf.c, conf.dt, conf.ud0,
        conf.sigPeriod, conf.sigStock, conf.sigWindow, conf.sigValidity,
        conf.sigQty, conf.idtyWindow, conf.msWindow, conf.xpercent, conf.msValidity,
        conf.stepMax, conf.medianTimeBlocks, conf.avgGenTime, conf.dtDiffEval,
        conf.blocksRot, (conf.percentRot == 1 ? "1.0" : conf.percentRot)
      ].join(':');
      block.previousHash = current ? current.hash : "";
      block.previousIssuer = current ? current.issuer : "";
      if (selfPubkey)
        block.issuer = selfPubkey;
      // Members merkle
      const joiners = _(joinData).keys();
      const previousCount = current ? current.membersCount : 0;
      if (joiners.length == 0 && !current) {
        throw constants.ERRORS.CANNOT_ROOT_BLOCK_NO_MEMBERS;
      }

      // Kicked people
      block.excluded = exclusions;

      /*****
       * Priority 1: keep the WoT sane
       */
      // Certifications from the WoT, to the WoT
      _(updates).keys().forEach((certifiedMember) => {
        const certs = updates[certifiedMember] || [];
        certs.forEach((cert) => {
          if (blockLen < maxLenOfBlock) {
            block.certifications.push(new Certification(cert).inline());
            blockLen++;
          }
        });
      });
      // Renewed
      joiners.forEach((joiner) => {
        const data = joinData[joiner];
        // Join only for non-members
        if (data.identity.member) {
          if (blockLen < maxLenOfBlock) {
            block.actives.push(new Membership(data.ms).inline());
            blockLen++;
          }
        }
      });
      // Leavers
      const leavers = _(leaveData).keys();
      leavers.forEach((leaver) => {
        const data = leaveData[leaver];
        // Join only for non-members
        if (data.identity.member) {
          if (blockLen < maxLenOfBlock) {
            block.leavers.push(new Membership(data.ms).inline());
            blockLen++;
          }
        }
      });

      /*****
       * Priority 2: revoked identities
       */
      revocations.forEach((idty) => {
        if (blockLen < maxLenOfBlock) {
          block.revoked.push([idty.pubkey, idty.revocation_sig].join(':'));
          blockLen++;
        }
      });

      /*****
       * Priority 3: newcomers/renewcomers
       */
      let countOfCertsToNewcomers = 0;
      // Newcomers
      // Newcomers + back people
      joiners.forEach((joiner) => {
        const data = joinData[joiner];
        // Identities only for never-have-been members
        if (!data.identity.member && !data.identity.wasMember) {
          block.identities.push(new Identity(data.identity).inline());
        }
        // Join only for non-members
        if (!data.identity.member) {
          block.joiners.push(new Membership(data.ms).inline());
        }
      });
      block.identities = _.sortBy(block.identities, (line) => {
        const sp = line.split(':');
        return sp[2] + sp[3];
      });

      // Certifications from the WoT, to newcomers
      joiners.forEach((joiner) => {
        const data = joinData[joiner] || [];
        data.certs.forEach((cert) => {
          countOfCertsToNewcomers++;
          block.certifications.push(new Certification(cert).inline());
        });
      });

      // Eventually revert newcomers/renewcomer
      if (Block.statics.getLen(block) > maxLenOfBlock) {
        for (let i = 0; i < block.identities.length; i++) {
          block.identities.pop();
          block.joiners.pop();
        }
        for (let i = 0; i < countOfCertsToNewcomers; i++) {
          block.certifications.pop();
        }
      }

      // Final number of members
      block.membersCount = previousCount + block.joiners.length - block.excluded.length;

      vHEAD.membersCount = block.membersCount;

      /*****
       * Priority 4: transactions
       */
      block.transactions = [];
      blockLen = Block.statics.getLen(block);
      if (blockLen < maxLenOfBlock) {
        transactions.forEach((tx) => {
          const txLen = Transaction.statics.getLen(tx);
          if (txLen <= constants.MAXIMUM_LEN_OF_COMPACT_TX && blockLen + txLen <= maxLenOfBlock && tx.version == constants.TRANSACTION_VERSION) {
            block.transactions.push({ raw: tx.compact() });
          }
          blockLen += txLen;
        });
      }

      /**
       * Finally handle the Universal Dividend
       */
      block.powMin = vHEAD.powMin;

      // BR_G13
      indexer.prepareDividend(vHEAD, vHEAD_1, conf);

      // BR_G14
      indexer.prepareUnitBase(vHEAD, vHEAD_1, conf);

      // Universal Dividend
      if (vHEAD.new_dividend) {
        block.dividend = vHEAD.dividend;
        block.unitbase = vHEAD.unitBase;
      } else {
        block.unitbase = block.number == 0 ? 0 : current.unitbase;
      }
      // Rotation
      block.issuersCount = vHEAD.issuersCount;
      block.issuersFrame = vHEAD.issuersFrame;
      block.issuersFrameVar = vHEAD.issuersFrameVar;
      // InnerHash
      block.time = block.medianTime;
      block.inner_hash = hashf(rawer.getBlockInnerPart(block)).toUpperCase();
      if (manualValues) {
        _.extend(block, _.omit(manualValues, 'time'));
      }
      return block;
    });
  }
}

/**
 * Class to implement strategy of automatic selection of incoming data for next block.
 * @constructor
 */
function NextBlockGenerator(mainContext, conf, dal) {

  const logger = require('../logger')(dal.profile);

  this.findNewCertsFromWoT = (current) => co(function *() {
    const updates = {};
    const updatesToFrom = {};
    const certs = yield dal.certsFindNew();
    const vHEAD_1 = yield mainContext.getvHEAD_1();
    for (const cert of certs) {
      const targetIdty = yield dal.getIdentityByHashOrNull(cert.target);
      // The identity must be known
      if (targetIdty) {
        const certSig = cert.sig;
        // Do not rely on certification block UID, prefer using the known hash of the block by its given number
        const targetBlock = yield dal.getBlock(cert.block_number);
        // Check if writable
        let duration = current && targetBlock ? current.medianTime - parseInt(targetBlock.medianTime) : 0;
        if (targetBlock && duration <= conf.sigWindow) {
          cert.sig = '';
          cert.currency = conf.currency;
          cert.issuer = cert.from;
          cert.idty_issuer = targetIdty.pubkey;
          cert.idty_uid = targetIdty.uid;
          cert.idty_buid = targetIdty.buid;
          cert.idty_sig = targetIdty.sig;
          cert.buid = current ? [cert.block_number, targetBlock.hash].join('-') : constants.BLOCK.SPECIAL_BLOCK;
          const rawCert = Certification.statics.fromJSON(cert).getRaw();
          if (keyring.verify(rawCert, certSig, cert.from)) {
            cert.sig = certSig;
            let exists = false;
            if (current) {
              // Already exists a link not replayable yet?
              exists = yield dal.existsNonReplayableLink(cert.from, cert.to);
            }
            if (!exists) {
              // Already exists a link not chainable yet?
              // No chainability block means absolutely nobody can issue certifications yet
              exists = yield dal.existsNonChainableLink(cert.from, vHEAD_1, conf.sigStock);
              if (!exists) {
                // It does NOT already exists a similar certification written, which is not replayable yet
                // Signatory must be a member
                const isSignatoryAMember = yield dal.isMember(cert.from);
                const isCertifiedANonLeavingMember = isSignatoryAMember && (yield dal.isMemberAndNonLeaver(cert.to));
                // Certified must be a member and non-leaver
                if (isSignatoryAMember && isCertifiedANonLeavingMember) {
                  updatesToFrom[cert.to] = updatesToFrom[cert.to] || [];
                  updates[cert.to] = updates[cert.to] || [];
                  if (updatesToFrom[cert.to].indexOf(cert.from) == -1) {
                    updates[cert.to].push(cert);
                    updatesToFrom[cert.to].push(cert.from);
                  }
                }
              }
            }
          }
        }
      }
    }
    return updates;
  });

  this.filterJoiners = (preJoinData) => co(function*() {
    const filtered = {};
    const filterings = [];
    const filter = (pubkey) => co(function*() {
      try {
        // No manual filtering, takes all BUT already used UID or pubkey
        let exists = yield rules.HELPERS.checkExistsUserID(preJoinData[pubkey].identity.uid, dal);
        if (exists && !preJoinData[pubkey].identity.wasMember) {
          throw 'UID already taken';
        }
        exists = yield rules.HELPERS.checkExistsPubkey(pubkey, dal);
        if (exists && !preJoinData[pubkey].identity.wasMember) {
          throw 'Pubkey already taken';
        }
        filtered[pubkey] = preJoinData[pubkey];
      }
      catch (err) {
        logger.warn(err);
      }
    });
    _.keys(preJoinData).forEach( (joinPubkey) => filterings.push(filter(joinPubkey)));
    yield filterings;
    return filtered;
  });
}

/**
 * Class to implement strategy of manual selection of root members for root block.
 * @constructor
 */
function ManualRootGenerator() {

  this.findNewCertsFromWoT = () => Q({});

  this.filterJoiners = (preJoinData) => co(function*() {
    const filtered = {};
    const newcomers = _(preJoinData).keys();
    const uids = [];
    newcomers.forEach((newcomer) => uids.push(preJoinData[newcomer].ms.userid));

    if (newcomers.length > 0) {
      return new Promise((resolve, reject) => {
        inquirer.prompt([{
              type: "checkbox",
              name: "uids",
              message: "Newcomers to add",
              choices: uids,
              default: uids[0]
            }],
            (answers) => {
              newcomers.forEach((newcomer) => {
                if (~answers.uids.indexOf(preJoinData[newcomer].ms.userid))
                  filtered[newcomer] = preJoinData[newcomer];
              });
              if (answers.uids.length == 0)
                reject('No newcomer selected');
              else
                resolve(filtered);
            });
      });
    } else {
      throw 'No newcomer found';
    }
  });
}
