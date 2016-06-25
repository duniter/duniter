"use strict";
const _               = require('underscore');
const co              = require('co');
const Q               = require('q');
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

  this.setConfDAL = (newConf, newDAL) => {
    dal = newDAL;
    conf = newConf;
    logger = require('../logger')(dal.profile);
  };

  this.checkBlock = (block, withPoWAndSignature) => co(function*(){
    if (withPoWAndSignature) {
      yield Q.nbind(rules.CHECK.ASYNC.ALL_LOCAL, rules, block, conf);
      yield Q.nbind(rules.CHECK.ASYNC.ALL_GLOBAL, rules, block, conf, dal);
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
      return block;
    }
    catch(err) {
      logger.info('Block #' + block.number + ' added to the blockchain in %s ms', (new Date() - start));
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
    return res;
  });

  this.revertBlock = (block) => co(function *() {
    const previousBlock = yield dal.getBlockByNumberAndHashOrNull(block.number - 1, block.previousHash || '');
    // Set the block as SIDE block (equivalent to removal from main branch)
    yield dal.blockDAL.setSideBlock(block, previousBlock);
    yield undoCertifications(block);
    yield undoLinks(block);
    if (previousBlock) {
      yield dal.undoObsoleteLinks(previousBlock.medianTime - conf.sigValidity);
    }
    yield undoMembersUpdate(block);
    yield undoTransactionSources(block);
    yield undoDeleteTransactions(block);
  });

  const checkIssuer = (block) => co(function*() {
    const isMember = yield Q.nbind(dal.isMember, dal, block.issuer);
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
    var i = 0;
    var found = "";
    while (!found && i < list.length) {
      found = list[i].match(regexp) ? list[i] : "";
      i++;
    }
    return found;
  };

  this.current = () => dal.getCurrentBlockOrNull();

  const saveBlockData = (current, block) => co(function*() {
    yield updateBlocksComputedVars(current, block);
    // Saves the block (DAL)
    yield Q.nbind(dal.saveBlock, dal, block);
    yield that.saveParametersForRootBlock(block);
    // Create/Update members (create new identities if do not exist)
    yield that.updateMembers(block);
    // Create/Update certifications
    yield that.updateCertifications(block);
    // Save links
    yield that.updateLinksForBlocks([block], dal.getBlockOrNull.bind(dal));
    // Compute obsolete links
    yield that.computeObsoleteLinks(block);
    // Compute obsolete memberships (active, joiner)
    yield that.computeObsoleteMemberships(block);
    // Update consumed sources & create new ones
    yield that.updateSources(block);
    // Delete eventually present transactions
    yield that.deleteTransactions(block);
    return block;
  });

  const updateBlocksComputedVars = (current, block) => co(function*() {
    if (current) {
      logger.trace('Block median time +%s', block.medianTime - current.medianTime);
      logger.trace('Block time '
          + ((block.time - current.time) >= 0 ? '+' : '')
          + '%d', block.time - current.time);
    }
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
    // Newcomers
    for (let i = 0, len = block.identities.length; i < len; i++) {
      let identity = block.identities[i];
      let idty = Identity.statics.fromInline(identity);
      // Computes the hash if not done yet
      if (!idty.hash)
        idty.hash = (hashf(rawer.getOfficialIdentity(idty)) + "").toUpperCase();
      yield dal.newIdentity(idty);
      yield cleanRejectedIdentities(idty);
    }
    // Joiners (come back)
    for (let i = 0, len = block.joiners.length; i < len; i++) {
      let inlineMS = block.joiners[i];
      let ms = Membership.statics.fromInline(inlineMS);
      yield dal.joinIdentity(ms.issuer, ms.number);
    }
    // Actives
    for (let i = 0, len = block.actives.length; i < len; i++) {
      let inlineMS = block.actives[i];
      let ms = Membership.statics.fromInline(inlineMS);
      yield dal.activeIdentity(ms.issuer, ms.number);
    }
    // Leavers
    for (let i = 0, len = block.leavers.length; i < len; i++) {
      let inlineMS = block.leavers[i];
      let ms = Membership.statics.fromInline(inlineMS);
      yield dal.leaveIdentity(ms.issuer, ms.number);
    }
    // Revoked
    for (let i = 0, len = block.revoked.length; i < len; i++) {
      let inlineRevocation = block.revoked[i];
      let revocation = Identity.statics.revocationFromInline(inlineRevocation);
      yield dal.revokeIdentity(revocation.pubkey);
    }
    // Excluded
    for (let i = 0, len = block.excluded.length; i < len; i++) {
      let excluded = block.excluded[i];
      dal.excludeIdentity(excluded);
    }
  });

  function undoMembersUpdate (block) {
    return co(function *() {
      // Undo 'join' which can be either newcomers or comebackers
      for (let i = 0, len = block.joiners.length; i < len; i++) {
        let msRaw = block.joiners[i];
        let ms = Membership.statics.fromInline(msRaw, 'IN', conf.currency);
        yield dal.unJoinIdentity(ms);
      }
      // Undo newcomers (may strengthen the undo 'join')
      for (let i = 0, len = block.identities.length; i < len; i++) {
        let identity = block.identities[i];
        let idty = Identity.statics.fromInline(identity);
        yield dal.unacceptIdentity(idty.pubkey);
      }
      // Undo renew (only remove last membership IN document)
      for (let i = 0, len = block.actives.length; i < len; i++) {
        let msRaw = block.actives[i];
        let ms = Membership.statics.fromInline(msRaw, 'IN', conf.currency);
        yield dal.unRenewIdentity(ms.issuer);
      }
      // Undo leavers (forget about their last membership OUT document)
      for (let i = 0, len = block.leavers.length; i < len; i++) {
        let msRaw = block.leavers[i];
        let ms = Membership.statics.fromInline(msRaw, 'OUT', conf.currency);
        yield dal.unLeaveIdentity(ms.issuer);
      }
      // Undo revoked (make them non-revoked)
      let revokedPubkeys = [];
      for (let i = 0, len = block.revoked.length; i < len; i++) {
        let inlineRevocation = block.revoked[i];
        let revocation = Identity.statics.revocationFromInline(inlineRevocation);
        revokedPubkeys.push(revocation.pubkey);
        yield dal.unrevokeIdentity(revocation.pubkey);
      }
      // Undo excluded (make them become members again, but set them as 'to be kicked')
      for (let i = 0, len = block.excluded.length; i < len; i++) {
        let pubkey = block.excluded[i];
        yield dal.unExcludeIdentity(pubkey, revokedPubkeys.indexOf(pubkey) !== -1);
      }
    });
  }

  function undoCertifications(block) {
    return co(function *() {
      for (let i = 0, len = block.certifications.length; i < len; i++) {
        let inlineCert = block.certifications[i];
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
      for (let i = 0, len = block.certifications.length; i < len; i++) {
        let inlineCert = block.certifications[i];
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
      for (let i = 0, len = block.transactions.length; i < len; i++) {
        let obj = block.transactions[i];
        obj.version = constants.DOCUMENTS_VERSION;
        obj.currency = block.currency;
        obj.issuers = obj.signatories;
        let tx = new Transaction(obj);
        let txObj = tx.getTransaction();
        for (let j = 0, len2 = txObj.inputs.length; j < len2; j++) {
          let input = txObj.inputs[j];
          yield dal.unConsumeSource(input.identifier, input.noffset);
        }
      }
    });
  }

  function undoDeleteTransactions(block) {
    return co(function *() {
      for (let i = 0, len = block.transactions.length; i < len; i++) {
        let obj = block.transactions[i];
        obj.version = constants.DOCUMENTS_VERSION;
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
    for (let c in block.certifications) {
      const inlineCert = block.certifications[c];
      let cert = Certification.statics.fromInline(inlineCert);
      let idty = yield Q.nbind(dal.getWritten, dal, cert.to);
      cert.target = new Identity(idty).getTargetHash();
      const to_uid = idty.uid;
      idty = yield Q.nbind(dal.getWritten, dal, cert.from);
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
      const sp = block.parameters.split(':');

      conf.c = parseFloat(sp[0]);
      conf.dt = parseInt(sp[1]);
      conf.ud0 = parseInt(sp[2]);
      conf.sigPeriod = parseInt(sp[3]);
      conf.sigStock = parseInt(sp[4]);
      conf.sigWindow = parseInt(sp[5]);
      conf.sigValidity = parseInt(sp[6]);
      conf.sigQty = parseInt(sp[7]);
      conf.idtyWindow = parseInt(sp[8]);
      conf.msWindow = parseInt(sp[9]);
      conf.xpercent = parseFloat(sp[10]);
      conf.msValidity = parseInt(sp[11]);
      conf.stepMax = parseInt(sp[12]);
      conf.medianTimeBlocks = parseInt(sp[13]);
      conf.avgGenTime = parseInt(sp[14]);
      conf.dtDiffEval = parseInt(sp[15]);
      conf.blocksRot = parseInt(sp[16]);
      conf.percentRot = parseFloat(sp[17]);
      conf.currency = block.currency;
      // Super important: adapt wotb module to handle the correct stock
      dal.wotb.setMaxCert(conf.sigStock);
      return dal.saveConf(conf);
    }
  });

  this.computeObsoleteLinks = (block) => co(function*() {
    yield dal.obsoletesLinks(block.medianTime - conf.sigValidity);
    const members = yield Q.nbind(dal.getMembers, dal);
    for (const m in members) {
      const idty = members[m];
      try {
        yield that.checkHaveEnoughLinks(idty.pubkey, {});
      } catch (notEnoughLinks) {
        yield Q.nbind(dal.setKicked, dal, idty.pubkey, new Identity(idty).getTargetHash(),
            notEnoughLinks ? true : false);
      }
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

  this.updateSources = (block) => co(function*() {
    if (block.dividend) {
      const idties = yield Q.nfcall(dal.getMembers);
      for (const i in idties) {
        const idty = idties[i];
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

      for (const t in block.transactions) {
        const obj = block.transactions[t];
        obj.version = constants.DOCUMENTS_VERSION;
        obj.currency = block.currency;
        obj.issuers = obj.signatories;
        const tx = new Transaction(obj);
        const txObj = tx.getTransaction();
        const txHash = tx.getHash(true);
        for (const i in txObj.inputs) {
          const input = txObj.inputs[i];
          yield dal.setConsumedSource(input.identifier, input.noffset);
        }

        let index = 0;
        for (const o in txObj.outputs) {
          const output = txObj.outputs[o];
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
    }
  });

  /**
   * New method for CREATING memberships found in blocks.
   * Made for performance reasons, this method will batch insert all memberships at once.
   * @param blocks
   * @returns {*}
   */
  this.updateMembershipsForBlocks = (blocks) => co(function *() {
    let memberships = [];
    let types = {
      'join': 'joiners',
      'active': 'actives',
      'leave': 'leavers'
    };
    for (let i = 0, len = blocks.length; i < len; i++) {
      let block = blocks[i];
      _.keys(types).forEach(function(type){
        let msType = type == 'leave' ? 'out' : 'in';
        let field = types[type];
        let mss = block[field];
        for (let j = 0, len2 = mss.length; j < len2; j++) {
          let msRaw = mss[j];
          var ms = Membership.statics.fromInline(msRaw, type == 'leave' ? 'OUT' : 'IN', block.currency);
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
   * @param getBlockOrNull
   * @returns {*}
   */
  this.updateLinksForBlocks = (blocks, getBlockOrNull) => co(function *() {
    let links = [];
    for (let i = 0, len = blocks.length; i < len; i++) {
      let block = blocks[i];
      for (let j = 0, len2 = block.certifications.length; j < len2; j++) {
        let inlineCert = block.certifications[j];
        let cert = Certification.statics.fromInline(inlineCert);
        let tagBlock = block;
        if (block.number > 0) {
          tagBlock = yield getBlockOrNull(cert.block_number);
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
  this.updateTransactionsForBlocks = (blocks) => co(function *() {
    let txs = [];
    for (let i = 0, len = blocks.length; i < len; i++) {
      let block = blocks[i];
      txs = txs.concat(block.transactions.map((tx) => {
        _.extend(tx, {
          block_number: block.number,
          time: block.medianTime,
          currency: block.currency,
          written: true,
          removed: false
        });
        return new Transaction(tx);
      }));
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
    let certs = [];
    for (let i = 0, len = blocks.length; i < len; i++) {
      let block = blocks[i];
      for (let j = 0, len2 = block.certifications.length; j < len2; j++) {
        let inlineCert = block.certifications[j];
        var cert = Certification.statics.fromInline(inlineCert);
        let to = yield dal.getWrittenIdtyByPubkey(cert.to);
        let to_uid = to.uid;
        cert.target = new Identity(to).getTargetHash();
        let from = yield dal.getWrittenIdtyByPubkey(cert.from);
        let from_uid = from.uid;
        let existing = yield dal.existsCert(cert);
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
    for (let i = 0, len = blocks.length; i < len; i++) {
      let block = blocks[i];
      // Transactions
      for (let j = 0, len2 = block.transactions.length; j < len2; j++) {
        let json = block.transactions[j];
        let obj = json;
        obj.version = constants.DOCUMENTS_VERSION;
        obj.currency = block.currency;
        obj.issuers = json.signatories;
        let tx = new Transaction(obj);
        let txObj = tx.getTransaction();
        let txHash = tx.getHash(true);
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
    for (const t in block.transactions) {
      var obj = block.transactions[t];
      obj.version = constants.DOCUMENTS_VERSION;
      obj.currency = block.currency;
      obj.issuers = obj.signatories;
      var tx = new Transaction(obj);
      var txHash = tx.getHash();
      yield dal.removeTxByHash(txHash);
    }
  });
}
