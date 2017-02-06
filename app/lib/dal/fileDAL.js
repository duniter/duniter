"use strict";
const Q       = require('q');
const co      = require('co');
const _       = require('underscore');
const indexer = require('../dup/indexer');
const logger = require('../logger')('filedal');
const Configuration = require('../entity/configuration');
const Merkle = require('../entity/merkle');
const Transaction = require('../entity/transaction');
const constants = require('../constants');
const ConfDAL = require('./fileDALs/confDAL');
const StatDAL = require('./fileDALs/statDAL');
const CFSStorage = require('./fileDALs/AbstractCFS');

module.exports = (params) => {
  return new FileDAL(params);
};

function FileDAL(params) {

  const rootPath = params.home;
  const myFS = params.fs;
  const sqliteDriver = params.dbf();
  const that = this;

  this.profile = 'DAL';
  this.wotb = params.wotb;

  // DALs
  this.confDAL = new ConfDAL(rootPath, myFS, null, that, CFSStorage);
  this.metaDAL = new (require('./sqliteDAL/MetaDAL'))(sqliteDriver);
  this.peerDAL = new (require('./sqliteDAL/PeerDAL'))(sqliteDriver);
  this.blockDAL = new (require('./sqliteDAL/BlockDAL'))(sqliteDriver);
  this.txsDAL = new (require('./sqliteDAL/TxsDAL'))(sqliteDriver);
  this.statDAL = new StatDAL(rootPath, myFS, null, that, CFSStorage);
  this.idtyDAL = new (require('./sqliteDAL/IdentityDAL'))(sqliteDriver);
  this.certDAL = new (require('./sqliteDAL/CertDAL'))(sqliteDriver);
  this.msDAL = new (require('./sqliteDAL/MembershipDAL'))(sqliteDriver);
  this.bindexDAL = new (require('./sqliteDAL/index/BIndexDAL'))(sqliteDriver);
  this.mindexDAL = new (require('./sqliteDAL/index/MIndexDAL'))(sqliteDriver);
  this.iindexDAL = new (require('./sqliteDAL/index/IIndexDAL'))(sqliteDriver);
  this.sindexDAL = new (require('./sqliteDAL/index/SIndexDAL'))(sqliteDriver);
  this.cindexDAL = new (require('./sqliteDAL/index/CIndexDAL'))(sqliteDriver);

  this.newDals = {
    'metaDAL': that.metaDAL,
    'blockDAL': that.blockDAL,
    'certDAL': that.certDAL,
    'msDAL': that.msDAL,
    'idtyDAL': that.idtyDAL,
    'txsDAL': that.txsDAL,
    'peerDAL': that.peerDAL,
    'confDAL': that.confDAL,
    'statDAL': that.statDAL,
    'bindexDAL': that.bindexDAL,
    'mindexDAL': that.mindexDAL,
    'iindexDAL': that.iindexDAL,
    'sindexDAL': that.sindexDAL,
    'cindexDAL': that.cindexDAL
  };

  this.init = () => co(function *() {
    const dalNames = _.keys(that.newDals);
    for (const dalName of dalNames) {
      const dal = that.newDals[dalName];
      yield dal.init();
    }
    logger.debug("Upgrade database...");
    yield that.metaDAL.upgradeDatabase();
    const latestMember = yield that.iindexDAL.getLatestMember();
    if (latestMember && that.wotb.getWoTSize() > latestMember.wotb_id + 1) {
      logger.warn('Maintenance: cleaning wotb...');
      while (that.wotb.getWoTSize() > latestMember.wotb_id + 1) {
        that.wotb.removeNode();
      }
    }
    // Update the maximum certifications count a member can issue into the C++ addon
    const currencyParams = yield that.getParameters();
    if (currencyParams && currencyParams.sigStock !== undefined && currencyParams.sigStock !== null) {
      that.wotb.setMaxCert(currencyParams.sigStock);
    }
  });

  this.getDBVersion = () => that.metaDAL.getVersion();

  that.writeFileOfBlock = (block) => that.blockDAL.saveBlock(block);

  this.writeSideFileOfBlock = (block) =>
      that.blockDAL.saveSideBlock(block);

  this.listAllPeers = () => that.peerDAL.listAll();

  this.getPeer = (pubkey) => co(function*() {
    try {
      return that.peerDAL.getPeer(pubkey)
    } catch (err) {
      throw Error('Unknown peer ' + pubkey);
    }
  });

  this.getBlock = (number) => co(function*() {
    const block = yield that.blockDAL.getBlock(number);
    return block || null;
  });

  this.getAbsoluteBlockByNumberAndHash = (number, hash) =>
      that.blockDAL.getAbsoluteBlock(number, hash);

  this.getBlockByBlockstampOrNull = (blockstamp) => {
    if (!blockstamp) throw "Blockstamp is required to find the block";
    const sp = blockstamp.split('-');
    const number = parseInt(sp[0]);
    const hash = sp[1];
    return that.getBlockByNumberAndHashOrNull(number, hash);
  };

  this.getBlockByBlockstamp = (blockstamp) => {
    if (!blockstamp) throw "Blockstamp is required to find the block";
    const sp = blockstamp.split('-');
    const number = parseInt(sp[0]);
    const hash = sp[1];
    return that.getBlockByNumberAndHash(number, hash);
  };

  this.getBlockByNumberAndHash = (number, hash) => co(function*() {
    try {
      const block = yield that.getBlock(number);
      if (!block || block.hash != hash)
        throw "Not found";
      else
        return block;
    } catch (err) {
      throw 'Block ' + [number, hash].join('-') + ' not found';
    }
  });

  this.getBlockByNumberAndHashOrNull = (number, hash) => co(function*() {
    try {
      return yield that.getBlockByNumberAndHash(number, hash);
    } catch (e) {
      return null;
    }
  });

  this.existsNonChainableLink = (from, vHEAD_1, sigStock) => co(function *() {
    // Cert period rule
    const medianTime = vHEAD_1 ? vHEAD_1.medianTime : 0;
    const linksFrom = yield that.cindexDAL.reducablesFrom(from);
    const unchainables = _.filter(linksFrom, (link) => link.chainable_on > medianTime);
    if (unchainables.length > 0) return true;
    // Max stock rule
    let activeLinks = _.filter(linksFrom, (link) => !link.expired_on);
    return activeLinks.length >= sigStock;
  });


  this.getCurrentBlockOrNull = () => co(function*() {
    let current = null;
    try {
      current = yield that.getBlockCurrent();
    } catch (e) {
      if (e != constants.ERROR.BLOCK.NO_CURRENT_BLOCK) {
        throw e;
      }
    }
    return current;
  });

  this.getPromoted = (number) => that.getBlock(number);

  // Block
  this.lastUDBlock = () => that.blockDAL.lastBlockWithDividend();

  this.getRootBlock = () => that.getBlock(0);

  this.lastBlockOfIssuer = function (issuer) {
    return that.blockDAL.lastBlockOfIssuer(issuer);
  };
  
  this.getCountOfPoW = (issuer) => that.blockDAL.getCountOfBlocksIssuedBy(issuer);

  this.getBlocksBetween = (start, end) => Q(this.blockDAL.getBlocks(Math.max(0, start), end));

  this.getForkBlocksFollowing = (current) => this.blockDAL.getNextForkBlocks(current.number, current.hash);

  this.getBlockCurrent = () => co(function*() {
    const current = yield that.blockDAL.getCurrent();
    if (!current)
      throw 'No current block';
    return current;
  });

  this.getValidLinksTo = (to) => that.cindexDAL.getValidLinksTo(to);

  this.getAvailableSourcesByPubkey = (pubkey) => this.sindexDAL.getAvailableForPubkey(pubkey);

  this.getIdentityByHashOrNull = (hash) => co(function*() {
    const pending = yield that.idtyDAL.getByHash(hash);
    if (!pending) {
      return that.iindexDAL.getFromHash(hash);
    }
    return pending;
  });

  this.getMembers = () => that.iindexDAL.getMembers();

  // TODO: this should definitely be reduced by removing fillInMembershipsOfIdentity
  this.getWritten = (pubkey) => co(function*() {
    try {
      return yield that.fillInMembershipsOfIdentity(that.iindexDAL.getFromPubkey(pubkey));
    } catch (err) {
      logger.error(err);
      return null;
    }
  });

  this.getWrittenIdtyByPubkey = (pubkey) => this.iindexDAL.getFromPubkey(pubkey);
  this.getWrittenIdtyByUID = (pubkey) => this.iindexDAL.getFromUID(pubkey);

  this.fillInMembershipsOfIdentity = (queryPromise) => co(function*() {
    try {
      const idty = yield Q(queryPromise);
      if (idty) {
        const mss = yield that.msDAL.getMembershipsOfIssuer(idty.pubkey);
        const mssFromMindex = yield that.mindexDAL.reducable(idty.pubkey);
        idty.memberships = mss.concat(mssFromMindex.map((ms) => {
          const sp = ms.created_on.split('-');
          return {
            membership: ms.leaving ? 'OUT' : 'IN',
            number: sp[0],
            fpr: sp[1],
            written_number: parseInt(ms.written_on)
          }
        }));
        return idty;
      }
    } catch (err) {
      logger.error(err);
    }
    return null;
  });

  this.findPeersWhoseHashIsIn = (hashes) => co(function*() {
    const peers = yield that.peerDAL.listAll();
    return _.chain(peers).filter((p) => hashes.indexOf(p.hash) !== -1).value();
  });

  this.getTxByHash = (hash) => that.txsDAL.getTX(hash);

  this.removeTxByHash = (hash) => that.txsDAL.removeTX(hash);

  this.getTransactionsPending = (versionMin) => that.txsDAL.getAllPending(versionMin);

  this.getNonWritten = (pubkey) => co(function*() {
    const pending = yield that.idtyDAL.getPendingIdentities();
    return _.chain(pending).where({pubkey: pubkey}).value();
  });

  this.getRevocatingMembers = () => co(function *() {
    const revoking = yield that.idtyDAL.getToRevoke();
    const toRevoke = [];
    for (const pending of revoking) {
      const idty = yield that.getWrittenIdtyByPubkey(pending.pubkey);
      if (!idty.revoked_on) {
        toRevoke.push(pending);
      }
    }
    return toRevoke;
  });

  this.getToBeKickedPubkeys = () => that.iindexDAL.getToBeKickedPubkeys();

  this.searchJustIdentities = (search) => co(function*() {
    const pendings = yield that.idtyDAL.searchThoseMatching(search);
    const writtens = yield that.iindexDAL.searchThoseMatching(search);
    const nonPendings = _.filter(writtens, (w) => {
      return _.where(pendings, { pubkey: w.pub }).length == 0;
    });
    const found = pendings.concat(nonPendings);
    return yield found.map(f => co(function*() {
      const ms = yield that.mindexDAL.getReducedMS(f.pub);
      if (ms) {
        f.revoked_on = ms.revoked_on ? parseInt(ms.revoked_on) : null;
        f.revoked = !!f.revoked_on;
        f.revocation_sig = ms.revocation || null;
      }
      return f;
    }))
  });

  this.certsToTarget = (pub, hash) => co(function*() {
    const certs = yield that.certDAL.getToTarget(hash);
    const links = yield that.cindexDAL.getValidLinksTo(pub);
    let matching = certs;
    yield links.map((entry) => co(function*() {
      entry.from = entry.issuer;
      const wbt = entry.written_on.split('-');
      const blockNumber = parseInt(entry.created_on); // created_on field of `c_index` does not have the full blockstamp
      const basedBlock = yield that.getBlock(blockNumber);
      entry.block = blockNumber;
      entry.block_number = blockNumber;
      entry.block_hash = basedBlock ? basedBlock.hash : null;
      entry.linked = true;
      entry.written_block = parseInt(wbt[0]);
      entry.written_hash = wbt[1];
      matching.push(entry);
    }));
    matching  = _.sortBy(matching, (c) => -c.block);
    matching.reverse();
    return matching;
  });

  this.certsFrom = (pubkey) => co(function*() {
    const certs = yield that.certDAL.getFromPubkeyCerts(pubkey);
    const links = yield that.cindexDAL.getValidLinksFrom(pubkey);
    let matching = certs;
    yield links.map((entry) => co(function*() {
      const idty = yield that.getWrittenIdtyByPubkey(entry.receiver);
      entry.from = entry.issuer;
      entry.to = entry.receiver;
      const cbt = entry.created_on.split('-');
      const wbt = entry.written_on.split('-');
      entry.block = parseInt(cbt[0]);
      entry.block_number = parseInt(cbt[0]);
      entry.block_hash = cbt[1];
      entry.target = idty.hash;
      entry.linked = true;
      entry.written_block = parseInt(wbt[0]);
      entry.written_hash = wbt[1];
      matching.push(entry);
    }));
    matching  = _.sortBy(matching, (c) => -c.block);
    matching.reverse();
    return matching;
  });

  this.isSentry = (pubkey, conf) => co(function*() {
    const current = yield that.getCurrentBlockOrNull();
    if (current) {
      const dSen = Math.ceil(Math.pow(current.membersCount, 1 / conf.stepMax));
      const linksFrom = yield that.cindexDAL.getValidLinksFrom(pubkey);
      const linksTo = yield that.cindexDAL.getValidLinksTo(pubkey);
      return linksFrom.length >= dSen && linksTo.length >= dSen;
    }
    return false;
  });

  this.certsFindNew = () => co(function*() {
    const certs = yield that.certDAL.getNotLinked();
    return _.chain(certs).where({linked: false}).sortBy((c) => -c.block).value();
  });

  this.certsNotLinkedToTarget = (hash) => co(function*() {
    const certs = yield that.certDAL.getNotLinkedToTarget(hash);
    return _.chain(certs).sortBy((c) => -c.block).value();
  });

  this.getMostRecentMembershipNumberForIssuer = (issuer) => co(function*() {
    const mss = yield that.msDAL.getMembershipsOfIssuer(issuer);
    const reduced = yield that.mindexDAL.getReducedMS(issuer);
    let max = reduced ? parseInt(reduced.created_on) : -1;
    for (const ms of mss) {
      max = Math.max(ms.number, max);
    }
    return max;
  });

  this.lastJoinOfIdentity = (target) => co(function *() {
    let pending = yield that.msDAL.getPendingINOfTarget(target);
    return _(pending).sortBy((ms) => -ms.number)[0];
  });

  this.findNewcomers = () => co(function*() {
    const mss = yield that.msDAL.getPendingIN();
    return _.chain(mss).sortBy((ms) => -ms.sigDate).value();
  });

  this.findLeavers = () => co(function*() {
    const mss = yield that.msDAL.getPendingOUT();
    return _.chain(mss).sortBy((ms) => -ms.sigDate).value();
  });

  this.existsNonReplayableLink = (from, to) => this.cindexDAL.existsNonReplayableLink(from, to);

  this.getSource = (identifier, pos) => that.sindexDAL.getSource(identifier, pos);

  this.isMember = (pubkey) => co(function*() {
    try {
      const idty = yield that.iindexDAL.getFromPubkey(pubkey);
      return idty.member;
    } catch (err) {
      return false;
    }
  });

  this.isMemberAndNonLeaver = (pubkey) => co(function*() {
    try {
      const idty = yield that.iindexDAL.getFromPubkey(pubkey);
      if (idty && idty.member) {
        return !(yield that.isLeaving(pubkey));
      }
      return false;
    } catch (err) {
      return false;
    }
  });

  this.isLeaving = (pubkey) => co(function*() {
    const ms = yield that.mindexDAL.getReducedMS(pubkey);
    return (ms && ms.leaving) || false;
  });

  this.existsCert = (cert) => co(function*() {
    const existing = yield that.certDAL.existsGivenCert(cert);
    if (existing) return existing;
    const existsLink = yield that.cindexDAL.existsNonReplayableLink(cert.from, cert.to);
    return !!existsLink;
  });

  this.deleteCert = (cert) => that.certDAL.deleteCert(cert);

  this.deleteMS = (ms) => that.msDAL.deleteMS(ms);

  this.setRevoked = (pubkey) => co(function*() {
    const idty = yield that.getWrittenIdtyByPubkey(pubkey);
    idty.revoked = true;
    return yield that.idtyDAL.saveIdentity(idty);
  });

  this.setRevocating = (existing, revocation_sig) => co(function *() {
    existing.revocation_sig = revocation_sig;
    existing.revoked = false;
    return that.idtyDAL.saveIdentity(existing);
  });

  this.getPeerOrNull = (pubkey) => co(function*() {
    let peer = null;
    try {
      peer = yield that.getPeer(pubkey);
    } catch (e) {
      if (e != constants.ERROR.BLOCK.NO_CURRENT_BLOCK) {
        throw e;
      }
    }
    return peer;
  });

  this.findAllPeersNEWUPBut = (pubkeys) => co(function*() {
    const peers = yield that.listAllPeers();
    return peers.filter((peer) => pubkeys.indexOf(peer.pubkey) == -1
    && ['UP'].indexOf(peer.status) !== -1);
  });

  this.listAllPeersWithStatusNewUP = () => co(function*() {
    const peers = yield that.peerDAL.listAll();
    return _.chain(peers)
        .filter((p) => ['UP']
            .indexOf(p.status) !== -1).value();
  });

  this.listAllPeersWithStatusNewUPWithtout = () => co(function *() {
    const peers = yield that.peerDAL.listAll();
    return _.chain(peers).filter((p) => p.status == 'UP').filter((p) => p.pubkey);
  });

  this.findPeers = (pubkey) => co(function*() {
    try {
      const peer = yield that.getPeer(pubkey);
      return [peer];
    } catch (err) {
      return [];
    }
  });

  this.getRandomlyUPsWithout = (pubkeys) => co(function*() {
    const peers = yield that.listAllPeersWithStatusNewUP();
    return peers.filter((peer) => pubkeys.indexOf(peer.pubkey) == -1);
  });

  this.setPeerUP = (pubkey) => co(function *() {
    try {
      const p = yield that.getPeer(pubkey);
      p.status = 'UP';
      p.first_down = null;
      p.last_try = null;
      return that.peerDAL.savePeer(p);
    } catch (err) {
      return null;
    }
  });

  this.setPeerDown = (pubkey) => co(function *() {
    try {
      // We do not set mirror peers as down (ex. of mirror: 'M1_HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk')
      if (!pubkey.match(/_/)) {
        const p = yield that.getPeer(pubkey);
        if (p) {
          const now = (new Date()).getTime();
          p.status = 'DOWN';
          if (!p.first_down) {
            p.first_down = now;
          }
          p.last_try = now;
          yield that.peerDAL.savePeer(p);
        }
      }
    } catch (err) {
      throw err;
    }
  });

  this.saveBlock = (block) => co(function*() {
    block.wrong = false;
    yield [
      that.saveBlockInFile(block),
      that.saveTxsInFiles(block.transactions, {block_number: block.number, time: block.medianTime, currency: block.currency })
    ];
  });

  this.generateIndexes = (block, conf) => co(function*() {
    const index = indexer.localIndex(block, conf);
    let mindex = indexer.mindex(index);
    let iindex = indexer.iindex(index);
    let sindex = indexer.sindex(index);
    let cindex = indexer.cindex(index);
    const HEAD = yield indexer.completeGlobalScope(block, conf, index, that);
    sindex = sindex.concat(yield indexer.ruleIndexGenDividend(HEAD, that));
    sindex = sindex.concat(yield indexer.ruleIndexGarbageSmallAccounts(HEAD, sindex, that));
    cindex = cindex.concat(yield indexer.ruleIndexGenCertificationExpiry(HEAD, that));
    mindex = mindex.concat(yield indexer.ruleIndexGenMembershipExpiry(HEAD, that));
    iindex = iindex.concat(yield indexer.ruleIndexGenExclusionByMembership(HEAD, mindex));
    iindex = iindex.concat(yield indexer.ruleIndexGenExclusionByCertificatons(HEAD, cindex, conf, that));
    mindex = mindex.concat(yield indexer.ruleIndexGenImplicitRevocation(HEAD, that));
    yield indexer.ruleIndexCorrectMembershipExpiryDate(HEAD, mindex, that);
    yield indexer.ruleIndexCorrectCertificationExpiryDate(HEAD, cindex, that);
    return { HEAD, mindex, iindex, sindex, cindex };
  });

  this.updateWotbLinks = (cindex) => co(function*() {
    for (const entry of cindex) {
      const from = yield that.getWrittenIdtyByPubkey(entry.issuer);
      const to = yield that.getWrittenIdtyByPubkey(entry.receiver);
      if (entry.op == constants.IDX_CREATE) {
        that.wotb.addLink(from.wotb_id, to.wotb_id, true);
      } else {
        // Update = removal
        that.wotb.removeLink(from.wotb_id, to.wotb_id, true);
      }
    }
  });

  this.trimIndexes = (maxNumber) => co(function*() {
    yield that.bindexDAL.trimBlocks(maxNumber);
    yield that.iindexDAL.trimRecords(maxNumber);
    yield that.mindexDAL.trimRecords(maxNumber);
    yield that.cindexDAL.trimExpiredCerts(maxNumber);
    yield that.sindexDAL.trimConsumedSource(maxNumber);
    return true;
  });

  this.trimSandboxes = (block) => co(function*() {
    yield that.certDAL.trimExpiredCerts(block.medianTime);
    yield that.msDAL.trimExpiredMemberships(block.medianTime);
    yield that.idtyDAL.trimExpiredIdentities(block.medianTime);
    return true;
  });

  this.savePendingMembership = (ms) => that.msDAL.savePendingMembership(ms);

  this.saveBlockInFile = (block) => co(function *() {
    yield that.writeFileOfBlock(block);
  });

  this.saveSideBlockInFile = (block) => that.writeSideFileOfBlock(block);

  this.saveTxsInFiles = (txs, extraProps) => {
    return Q.all(txs.map((tx) => co(function*() {
      _.extend(tx, extraProps);
      const sp = tx.blockstamp.split('-');
      tx.blockstampTime = (yield that.getBlockByNumberAndHash(sp[0], sp[1])).medianTime;
      const txEntity = new Transaction(tx);
      txEntity.computeAllHashes();
      return that.txsDAL.addLinked(txEntity);
    })));
  };

  this.merkleForPeers = () => co(function *() {
    let peers = yield that.listAllPeersWithStatusNewUP();
    const leaves = peers.map((peer) => peer.hash);
    const merkle = new Merkle();
    merkle.initialize(leaves);
    return merkle;
  });

  this.removeAllSourcesOfBlock = (blockstamp) => that.sindexDAL.removeBlock(blockstamp);

  this.updateTransactions = (txs) => that.txsDAL.insertBatchOfTxs(txs);

  this.savePendingIdentity = (idty) => that.idtyDAL.saveIdentity(idty);

  this.revokeIdentity = (pubkey) => that.idtyDAL.revokeIdentity(pubkey);

  this.removeUnWrittenWithPubkey = (pubkey) => co(function*() {
    return yield that.idtyDAL.removeUnWrittenWithPubkey(pubkey)
  });

  this.removeUnWrittenWithUID = (pubkey) => co(function*() {
    return yield that.idtyDAL.removeUnWrittenWithUID(pubkey);
  });

  this.registerNewCertification = (cert) => that.certDAL.saveNewCertification(cert);

  this.saveTransaction = (tx) => that.txsDAL.addPending(tx);

  this.getTransactionsHistory = (pubkey) => co(function*() {
    const history = {
      sent: [],
      received: [],
      sending: [],
      receiving: []
    };
    const res = yield [
      that.txsDAL.getLinkedWithIssuer(pubkey),
      that.txsDAL.getLinkedWithRecipient(pubkey),
      that.txsDAL.getPendingWithIssuer(pubkey),
      that.txsDAL.getPendingWithRecipient(pubkey)
    ];
    history.sent = res[0] || [];
    history.received = res[1] || [];
    history.sending = res[2] || [];
    history.pending = res[3] || [];
    return history;
  });

  this.getUDHistory = (pubkey) => co(function *() {
    const sources = yield that.sindexDAL.getUDSources(pubkey);
    return {
      history: sources.map((src) => _.extend({
        block_number: src.pos,
        time: src.written_time
      }, src))
    };
  });

  this.savePeer = (peer) => that.peerDAL.savePeer(peer);

  this.getUniqueIssuersBetween = (start, end) => co(function *() {
    const current = yield that.blockDAL.getCurrent();
    const firstBlock = Math.max(0, start);
    const lastBlock = Math.max(0, Math.min(current.number, end));
    const blocks = yield that.blockDAL.getBlocks(firstBlock, lastBlock);
    return _.chain(blocks).pluck('issuer').uniq().value();
  });

  /**
   * Gets a range of entries for the last `start`th to the last `end`th HEAD entry.
   * @param start The starting entry number (min. 1)
   * @param end The ending entry (max. BINDEX length)
   * @param property If provided, transforms the range of entries into an array of the asked property.
   */
  this.range = (start, end, property) => co(function*() {
    const range = yield that.bindexDAL.range(start, end);
    if (property) {
      // Filter on a particular property
      return range.map((b) => b[property]);
    } else {
      return range;
    }
  });

  /**
   * Get the last `n`th entry from the BINDEX.
   * @param n The entry number (min. 1).
   */
  this.head = (n) => this.bindexDAL.head(n);

  /***********************
   *    CONFIGURATION
   **********************/

  this.getParameters = () => that.confDAL.getParameters();

  this.loadConf = (overrideConf, defaultConf) => co(function *() {
    let conf = Configuration.statics.complete(overrideConf || {});
    if (!defaultConf) {
      const savedConf = yield that.confDAL.loadConf();
      conf = _(savedConf).extend(overrideConf || {});
    }
    if (that.loadConfHook) {
      yield that.loadConfHook(conf);
    }
    return conf;
  });

  this.saveConf = (confToSave) => {
    return co(function*() {
      // Save the conf in file
      let theConf = confToSave;
      if (that.saveConfHook) {
        theConf = yield that.saveConfHook(theConf);
      }
      return that.confDAL.saveConf(theConf);
    });
  };

  /***********************
   *     STATISTICS
   **********************/

  this.loadStats = that.statDAL.loadStats;
  this.getStat = that.statDAL.getStat;
  this.pushStats = that.statDAL.pushStats;

  this.cleanCaches = () => co(function *() {
    yield _.values(that.newDals).map((dal) => dal.cleanCache && dal.cleanCache());
  });

  this.close = () => co(function *() {
    yield _.values(that.newDals).map((dal) => dal.cleanCache && dal.cleanCache());
    return sqliteDriver.closeConnection();
  });

  this.resetPeers = () => co(function *() {
    that.peerDAL.removeAll();
    return yield that.close();
  });

  this.getLogContent = (linesQuantity) => new Promise((resolve, reject) => {
    try {
      let lines = [], i = 0;
      const logPath = require('path').join(rootPath, 'duniter.log');
      const readStream = require('fs').createReadStream(logPath);
      readStream.on('error', (err) => reject(err));
      const lineReader = require('readline').createInterface({
        input: readStream
      });
      lineReader.on('line', (line) => {
        line = "\n" + line;
        lines.push(line);
        i++;
        if (i >= linesQuantity) lines.shift();
      });
      lineReader.on('close', () => resolve(lines));
      lineReader.on('error', (err) => reject(err));
    } catch (e) {
      reject(e);
    }
  });
}
