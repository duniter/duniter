import {SQLiteDriver} from "./drivers/SQLiteDriver"
import {ConfDAL} from "./fileDALs/ConfDAL"
import {StatDAL} from "./fileDALs/StatDAL"
import {ConfDTO} from "../dto/ConfDTO"
import {BlockDTO} from "../dto/BlockDTO"
import {DBHead} from "../db/DBHead"
import {DBIdentity} from "./sqliteDAL/IdentityDAL"
import {CindexEntry, IindexEntry, IndexEntry, MindexEntry, SindexEntry} from "../indexer"
import {DBPeer} from "./sqliteDAL/PeerDAL"
import {TransactionDTO} from "../dto/TransactionDTO"
import {DBCert} from "./sqliteDAL/CertDAL"
import {DBWallet} from "./sqliteDAL/WalletDAL"
import {DBTx} from "./sqliteDAL/TxsDAL"
import {DBBlock} from "../db/DBBlock"
import {DBMembership} from "./sqliteDAL/MembershipDAL"

const fs      = require('fs')
const path    = require('path')
const readline = require('readline')
const _       = require('underscore');
const common = require('duniter-common');
const indexer = require('../indexer').Indexer
const logger = require('../logger').NewLogger('filedal');
const Configuration = require('../entity/configuration');
const Merkle = require('../entity/merkle');
const Transaction = require('../entity/transaction');
const constants = require('../constants');

export interface FileDALParams {
  home:string
  fs:any
  dbf:() => SQLiteDriver
  wotb:any
}

export class FileDAL {

  rootPath:string
  myFS:any
  sqliteDriver:SQLiteDriver
  wotb:any
  profile:string

  confDAL:any
  metaDAL:any
  peerDAL:any
  blockDAL:any
  txsDAL:any
  statDAL:any
  idtyDAL:any
  certDAL:any
  msDAL:any
  walletDAL:any
  bindexDAL:any
  mindexDAL:any
  iindexDAL:any
  sindexDAL:any
  cindexDAL:any
  newDals:any

  loadConfHook: (conf:ConfDTO) => Promise<void>
  saveConfHook: (conf:ConfDTO) => Promise<ConfDTO>

  constructor(params:FileDALParams) {
    this.rootPath = params.home
    this.myFS = params.fs
    this.sqliteDriver = params.dbf()
    this.wotb = params.wotb
    this.profile = 'DAL'

    // DALs
    this.confDAL = new ConfDAL(this.rootPath, this.myFS)
    this.metaDAL = new (require('./sqliteDAL/MetaDAL').MetaDAL)(this.sqliteDriver);
    this.peerDAL = new (require('./sqliteDAL/PeerDAL').PeerDAL)(this.sqliteDriver);
    this.blockDAL = new (require('./sqliteDAL/BlockDAL').BlockDAL)(this.sqliteDriver);
    this.txsDAL = new (require('./sqliteDAL/TxsDAL').TxsDAL)(this.sqliteDriver);
    this.statDAL = new StatDAL(this.rootPath, this.myFS)
    this.idtyDAL = new (require('./sqliteDAL/IdentityDAL').IdentityDAL)(this.sqliteDriver);
    this.certDAL = new (require('./sqliteDAL/CertDAL').CertDAL)(this.sqliteDriver);
    this.msDAL = new (require('./sqliteDAL/MembershipDAL').MembershipDAL)(this.sqliteDriver);
    this.walletDAL = new (require('./sqliteDAL/WalletDAL').WalletDAL)(this.sqliteDriver);
    this.bindexDAL = new (require('./sqliteDAL/index/BIndexDAL').BIndexDAL)(this.sqliteDriver);
    this.mindexDAL = new (require('./sqliteDAL/index/MIndexDAL').MIndexDAL)(this.sqliteDriver);
    this.iindexDAL = new (require('./sqliteDAL/index/IIndexDAL').IIndexDAL)(this.sqliteDriver);
    this.sindexDAL = new (require('./sqliteDAL/index/SIndexDAL').SIndexDAL)(this.sqliteDriver);
    this.cindexDAL = new (require('./sqliteDAL/index/CIndexDAL').CIndexDAL)(this.sqliteDriver);

    this.newDals = {
      'metaDAL': this.metaDAL,
      'blockDAL': this.blockDAL,
      'certDAL': this.certDAL,
      'msDAL': this.msDAL,
      'idtyDAL': this.idtyDAL,
      'txsDAL': this.txsDAL,
      'peerDAL': this.peerDAL,
      'confDAL': this.confDAL,
      'statDAL': this.statDAL,
      'walletDAL': this.walletDAL,
      'bindexDAL': this.bindexDAL,
      'mindexDAL': this.mindexDAL,
      'iindexDAL': this.iindexDAL,
      'sindexDAL': this.sindexDAL,
      'cindexDAL': this.cindexDAL
    }
  }

  async init(conf:ConfDTO) {
    const dalNames = _.keys(this.newDals);
    for (const dalName of dalNames) {
      const dal = this.newDals[dalName];
      await dal.init();
    }
    logger.debug("Upgrade database...");
    await this.metaDAL.upgradeDatabase(conf);
    const latestMember = await this.iindexDAL.getLatestMember();
    if (latestMember && this.wotb.getWoTSize() > latestMember.wotb_id + 1) {
      logger.warn('Maintenance: cleaning wotb...');
      while (this.wotb.getWoTSize() > latestMember.wotb_id + 1) {
        this.wotb.removeNode();
      }
    }
    // Update the maximum certifications count a member can issue into the C++ addon
    const currencyParams = await this.getParameters();
    if (currencyParams && currencyParams.sigStock !== undefined && currencyParams.sigStock !== null) {
      this.wotb.setMaxCert(currencyParams.sigStock);
    }
  }

  getDBVersion() {
    return this.metaDAL.getVersion()
  }

  writeFileOfBlock(block:DBBlock) {
    return this.blockDAL.saveBlock(block)
  }

  writeSideFileOfBlock(block:DBBlock) {
    return this.blockDAL.saveSideBlock(block)
  }

  listAllPeers() {
    return this.peerDAL.listAll()
  }

  async getPeer(pubkey:string) {
    try {
      return this.peerDAL.getPeer(pubkey)
    } catch (err) {
      throw Error('Unknown peer ' + pubkey);
    }
  }

  async getBlock(number:number) {
    const block = await this.blockDAL.getBlock(number)
    return block || null;
  }

  getAbsoluteBlockByNumberAndHash(number:number, hash:string) {
    return this.blockDAL.getAbsoluteBlock(number, hash)
  }

  getBlockByBlockstampOrNull(blockstamp:string) {
    if (!blockstamp) throw "Blockstamp is required to find the block";
    const sp = blockstamp.split('-');
    const number = parseInt(sp[0]);
    const hash = sp[1];
    return this.getBlockByNumberAndHashOrNull(number, hash);
  }

  getBlockByBlockstamp(blockstamp:string) {
    if (!blockstamp) throw "Blockstamp is required to find the block";
    const sp = blockstamp.split('-');
    const number = parseInt(sp[0]);
    const hash = sp[1];
    return this.getBlockByNumberAndHash(number, hash);
  }

  async getBlockByNumberAndHash(number:number, hash:string) {
    try {
      const block = await this.getBlock(number);
      if (!block || block.hash != hash)
        throw "Not found";
      else
        return block;
    } catch (err) {
      throw 'Block ' + [number, hash].join('-') + ' not found';
    }
  }

  async getBlockByNumberAndHashOrNull(number:number, hash:string) {
    try {
      return await this.getBlockByNumberAndHash(number, hash)
    } catch (e) {
      return null;
    }
  }

  async existsNonChainableLink(from:string, vHEAD_1:DBHead, sigStock:number) {
    // Cert period rule
    const medianTime = vHEAD_1 ? vHEAD_1.medianTime : 0;
    const linksFrom = await this.cindexDAL.reducablesFrom(from)
    const unchainables = _.filter(linksFrom, (link:CindexEntry) => link.chainable_on > medianTime);
    if (unchainables.length > 0) return true;
    // Max stock rule
    let activeLinks = _.filter(linksFrom, (link:CindexEntry) => !link.expired_on);
    return activeLinks.length >= sigStock;
  }


  async getCurrentBlockOrNull() {
    let current = null;
    try {
      current = await this.getBlockCurrent()
    } catch (e) {
      if (e != constants.ERROR.BLOCK.NO_CURRENT_BLOCK) {
        throw e;
      }
    }
    return current;
  }

  getPromoted(number:number) {
    return this.getBlock(number)
  }

  // Block
  lastUDBlock() {
    return this.blockDAL.lastBlockWithDividend()
  }

  getRootBlock() {
    return this.getBlock(0)
  }

  lastBlockOfIssuer(issuer:string) {
    return this.blockDAL.lastBlockOfIssuer(issuer);
  }
  
  getCountOfPoW(issuer:string) {
    return this.blockDAL.getCountOfBlocksIssuedBy(issuer)
  }

  getBlocksBetween (start:number, end:number) {
    return Promise.resolve(this.blockDAL.getBlocks(Math.max(0, start), end))
  }

  getForkBlocksFollowing(current:DBBlock) {
    return this.blockDAL.getNextForkBlocks(current.number, current.hash)
  }

  async getBlockCurrent() {
    const current = await this.blockDAL.getCurrent();
    if (!current)
      throw 'No current block';
    return current;
  }

  getValidLinksTo(to:string) {
    return this.cindexDAL.getValidLinksTo(to)
  }

  getAvailableSourcesByPubkey(pubkey:string) {
    return this.sindexDAL.getAvailableForPubkey(pubkey)
  }

  async getIdentityByHashOrNull(hash:string) {
    const pending = await this.idtyDAL.getByHash(hash);
    if (!pending) {
      return this.iindexDAL.getFromHash(hash);
    }
    return pending;
  }

  getMembers() {
    return this.iindexDAL.getMembers()
  }

  // TODO: this should definitely be reduced by removing fillInMembershipsOfIdentity
  async getWritten(pubkey:string) {
    try {
      return await this.fillInMembershipsOfIdentity(this.iindexDAL.getFromPubkey(pubkey));
    } catch (err) {
      logger.error(err);
      return null;
    }
  }

  getWrittenIdtyByPubkey(pubkey:string) {
    return this.iindexDAL.getFromPubkey(pubkey)
  }

  getWrittenIdtyByUID(uid:string) {
    return this.iindexDAL.getFromUID(uid)
  }

  async fillInMembershipsOfIdentity(queryPromise:Promise<DBIdentity>) {
    try {
      const idty:any = await Promise.resolve(queryPromise)
      if (idty) {
        const mss = await this.msDAL.getMembershipsOfIssuer(idty.pubkey);
        const mssFromMindex = await this.mindexDAL.reducable(idty.pubkey);
        idty.memberships = mss.concat(mssFromMindex.map((ms:MindexEntry) => {
          const sp = ms.created_on.split('-');
          return {
            blockstamp: ms.created_on,
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
  }

  async findPeersWhoseHashIsIn(hashes:string[]) {
    const peers = await this.peerDAL.listAll();
    return _.chain(peers).filter((p:DBPeer) => hashes.indexOf(p.hash) !== -1).value();
  }

  getTxByHash(hash:string) {
    return this.txsDAL.getTX(hash)
  }

  removeTxByHash(hash:string) {
    return this.txsDAL.removeTX(hash)
  }

  getTransactionsPending(versionMin:number) {
    return this.txsDAL.getAllPending(versionMin)
  }

  async getNonWritten(pubkey:string) {
    const pending = await this.idtyDAL.getPendingIdentities();
    return _.chain(pending).where({pubkey: pubkey}).value();
  }

  async getRevocatingMembers() {
    const revoking = await this.idtyDAL.getToRevoke();
    const toRevoke = [];
    for (const pending of revoking) {
      const idty = await this.getWrittenIdtyByPubkey(pending.pubkey);
      if (!idty.revoked_on) {
        toRevoke.push(pending);
      }
    }
    return toRevoke;
  }

  getToBeKickedPubkeys() {
    return this.iindexDAL.getToBeKickedPubkeys()
  }

  async searchJustIdentities(search:string) {
    const pendings = await this.idtyDAL.searchThoseMatching(search);
    const writtens = await this.iindexDAL.searchThoseMatching(search);
    const nonPendings = _.filter(writtens, (w:IindexEntry) => {
      return _.where(pendings, { pubkey: w.pub }).length == 0;
    });
    const found = pendings.concat(nonPendings.map((i:any) => {
      // Use the correct field
      i.pubkey = i.pub
      return i
    }));
    return await Promise.all(found.map(async (f:any) => {
      const ms = await this.mindexDAL.getReducedMS(f.pub);
      if (ms) {
        f.revoked_on = ms.revoked_on ? parseInt(ms.revoked_on) : null;
        f.revoked = !!f.revoked_on;
        f.revocation_sig = ms.revocation || null;
      }
      return f;
    }))
  }

  async certsToTarget(pub:string, hash:string) {
    const certs = await this.certDAL.getToTarget(hash);
    const links = await this.cindexDAL.getValidLinksTo(pub);
    let matching = certs;
    await Promise.all(links.map(async (entry:any) => {
      entry.from = entry.issuer;
      const wbt = entry.written_on.split('-');
      const blockNumber = parseInt(entry.created_on); // created_on field of `c_index` does not have the full blockstamp
      const basedBlock = await this.getBlock(blockNumber);
      entry.block = blockNumber;
      entry.block_number = blockNumber;
      entry.block_hash = basedBlock ? basedBlock.hash : null;
      entry.linked = true;
      entry.written_block = parseInt(wbt[0]);
      entry.written_hash = wbt[1];
      matching.push(entry);
    }))
    matching  = _.sortBy(matching, (c:DBCert) => -c.block);
    matching.reverse();
    return matching;
  }

  async certsFrom(pubkey:string) {
    const certs = await this.certDAL.getFromPubkeyCerts(pubkey);
    const links = await this.cindexDAL.getValidLinksFrom(pubkey);
    let matching = certs;
    await Promise.all(links.map(async (entry:any) => {
      const idty = await this.getWrittenIdtyByPubkey(entry.receiver);
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
    }))
    matching  = _.sortBy(matching, (c:DBCert) => -c.block);
    matching.reverse();
    return matching;
  }

  async isSentry(pubkey:string, conf:ConfDTO) {
    const current = await this.getCurrentBlockOrNull();
    if (current) {
      const dSen = Math.ceil(Math.pow(current.membersCount, 1 / conf.stepMax));
      const linksFrom = await this.cindexDAL.getValidLinksFrom(pubkey);
      const linksTo = await this.cindexDAL.getValidLinksTo(pubkey);
      return linksFrom.length >= dSen && linksTo.length >= dSen;
    }
    return false;
  }

  async certsFindNew() {
    const certs = await this.certDAL.getNotLinked();
    return _.chain(certs).where({linked: false}).sortBy((c:DBCert) => -c.block).value();
  }

  async certsNotLinkedToTarget(hash:string) {
    const certs = await this.certDAL.getNotLinkedToTarget(hash);
    return _.chain(certs).sortBy((c:any) => -c.block).value();
  }

  async getMostRecentMembershipNumberForIssuer(issuer:string) {
    const mss = await this.msDAL.getMembershipsOfIssuer(issuer);
    const reduced = await this.mindexDAL.getReducedMS(issuer);
    let max = reduced ? parseInt(reduced.created_on) : -1;
    for (const ms of mss) {
      max = Math.max(ms.number, max);
    }
    return max;
  }

  async lastJoinOfIdentity(target:string) {
    let pending = await this.msDAL.getPendingINOfTarget(target);
    return _(pending).sortBy((ms:any) => -ms.number)[0];
  }

  async findNewcomers(blockMedianTime:number) {
    const pending = await this.msDAL.getPendingIN()
    const mss = await Promise.all(pending.map(async (p:any) => {
      const reduced = await this.mindexDAL.getReducedMS(p.issuer)
      if (!reduced || !reduced.chainable_on || blockMedianTime >= reduced.chainable_on || blockMedianTime < constants.TIME_TO_TURN_ON_BRG_107) {
        return p
      }
      return null
    }))
    return _.chain(mss)
      .filter((ms:any) => ms)
      .sortBy((ms:any) => -ms.sigDate)
      .value()
  }

  async findLeavers() {
    const mss = await this.msDAL.getPendingOUT();
    return _.chain(mss).sortBy((ms:any) => -ms.sigDate).value();
  }

  existsNonReplayableLink(from:string, to:string) {
    return  this.cindexDAL.existsNonReplayableLink(from, to)
  }

  getSource(identifier:string, pos:number) {
    return this.sindexDAL.getSource(identifier, pos)
  }

  async isMember(pubkey:string) {
    try {
      const idty = await this.iindexDAL.getFromPubkey(pubkey);
      return idty.member;
    } catch (err) {
      return false;
    }
  }

  async isMemberAndNonLeaver(pubkey:string) {
    try {
      const idty = await this.iindexDAL.getFromPubkey(pubkey);
      if (idty && idty.member) {
        return !(await this.isLeaving(pubkey));
      }
      return false;
    } catch (err) {
      return false;
    }
  }

  async isLeaving(pubkey:string) {
    const ms = await this.mindexDAL.getReducedMS(pubkey);
    return (ms && ms.leaving) || false;
  }

  async existsCert(cert:any) {
    const existing = await this.certDAL.existsGivenCert(cert);
    if (existing) return existing;
    const existsLink = await this.cindexDAL.existsNonReplayableLink(cert.from, cert.to);
    return !!existsLink;
  }

  deleteCert(cert:any) {
    return this.certDAL.deleteCert(cert)
  }

  deleteMS(ms:any) {
    return this.msDAL.deleteMS(ms)
  }

  async setRevoked(pubkey:string) {
    const idty = await this.getWrittenIdtyByPubkey(pubkey);
    idty.revoked = true;
    return await this.idtyDAL.saveIdentity(idty);
  }

  setRevocating = (existing:DBIdentity, revocation_sig:string) => {
    existing.revocation_sig = revocation_sig;
    existing.revoked = false;
    return this.idtyDAL.saveIdentity(existing);
  }

  async getPeerOrNull(pubkey:string) {
    let peer = null;
    try {
      peer = await this.getPeer(pubkey);
    } catch (e) {
      if (e != constants.ERROR.BLOCK.NO_CURRENT_BLOCK) {
        throw e;
      }
    }
    return peer;
  }

  async findAllPeersNEWUPBut(pubkeys:string[]) {
    const peers = await this.listAllPeers();
    return peers.filter((peer:DBPeer) => pubkeys.indexOf(peer.pubkey) == -1
    && ['UP'].indexOf(peer.status) !== -1);
  }

  async listAllPeersWithStatusNewUP() {
    const peers = await this.peerDAL.listAll();
    return _.chain(peers)
        .filter((p:DBPeer) => ['UP']
            .indexOf(p.status) !== -1).value();
  }

  async listAllPeersWithStatusNewUPWithtout(pub:string) {
    const peers = await this.peerDAL.listAll();
    return _.chain(peers).filter((p:DBPeer) => p.status == 'UP').filter((p:DBPeer) => p.pubkey !== pub).value();
  }

  async findPeers(pubkey:string) {
    try {
      const peer = await this.getPeer(pubkey);
      return [peer];
    } catch (err) {
      return [];
    }
  }

  async getRandomlyUPsWithout(pubkeys:string[]) {
    const peers = await this.listAllPeersWithStatusNewUP();
    return peers.filter((peer:DBPeer) => pubkeys.indexOf(peer.pubkey) == -1);
  }

  async setPeerUP(pubkey:string) {
    try {
      const p = await this.getPeer(pubkey)
      p.status = 'UP';
      p.first_down = null;
      p.last_try = null;
      return this.peerDAL.savePeer(p);
    } catch (err) {
      return null;
    }
  }

  async setPeerDown(pubkey:string) {
    try {
      // We do not set mirror peers as down (ex. of mirror: 'M1_HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk')
      if (!pubkey.match(/_/)) {
        const p = await this.getPeer(pubkey)
        if (p) {
          const now = (new Date()).getTime();
          p.status = 'DOWN';
          if (!p.first_down) {
            p.first_down = now;
          }
          p.last_try = now;
          await this.peerDAL.savePeer(p)
        }
      }
    } catch (err) {
      throw err;
    }
  }

  async saveBlock(block:BlockDTO) {
    const dbb = DBBlock.fromBlockDTO(block)
    dbb.wrong = false;
    await Promise.all([
      this.saveBlockInFile(dbb),
      this.saveTxsInFiles(block.transactions, block.number, block.medianTime)
    ])
  }

  async generateIndexes(block:DBBlock, conf:ConfDTO, index:IndexEntry[], HEAD:DBHead) {
    // We need to recompute the indexes for block#0
    if (!index || !HEAD || HEAD.number == 0) {
      index = indexer.localIndex(block, conf)
      HEAD = await indexer.completeGlobalScope(block, conf, index, this)
    }
    let mindex = indexer.mindex(index);
    let iindex = indexer.iindex(index);
    let sindex = indexer.sindex(index);
    let cindex = indexer.cindex(index);
    sindex = sindex.concat(await indexer.ruleIndexGenDividend(HEAD, this));
    sindex = sindex.concat(await indexer.ruleIndexGarbageSmallAccounts(HEAD, sindex, this));
    cindex = cindex.concat(await indexer.ruleIndexGenCertificationExpiry(HEAD, this));
    mindex = mindex.concat(await indexer.ruleIndexGenMembershipExpiry(HEAD, this));
    iindex = iindex.concat(await indexer.ruleIndexGenExclusionByMembership(HEAD, mindex, this));
    iindex = iindex.concat(await indexer.ruleIndexGenExclusionByCertificatons(HEAD, cindex, iindex, conf, this));
    mindex = mindex.concat(await indexer.ruleIndexGenImplicitRevocation(HEAD, this));
    await indexer.ruleIndexCorrectMembershipExpiryDate(HEAD, mindex, this);
    await indexer.ruleIndexCorrectCertificationExpiryDate(HEAD, cindex, this);
    return { HEAD, mindex, iindex, sindex, cindex };
  }

  async updateWotbLinks(cindex:CindexEntry[]) {
    for (const entry of cindex) {
      const from = await this.getWrittenIdtyByPubkey(entry.issuer);
      const to = await this.getWrittenIdtyByPubkey(entry.receiver);
      if (entry.op == common.constants.IDX_CREATE) {
        this.wotb.addLink(from.wotb_id, to.wotb_id);
      } else {
        // Update = removal
        this.wotb.removeLink(from.wotb_id, to.wotb_id);
      }
    }
  }

  async trimIndexes(maxNumber:number) {
    await this.bindexDAL.trimBlocks(maxNumber);
    await this.iindexDAL.trimRecords(maxNumber);
    await this.mindexDAL.trimRecords(maxNumber);
    await this.cindexDAL.trimExpiredCerts(maxNumber);
    await this.sindexDAL.trimConsumedSource(maxNumber);
    return true;
  }

  async trimSandboxes(block:DBBlock) {
    await this.certDAL.trimExpiredCerts(block.medianTime);
    await this.msDAL.trimExpiredMemberships(block.medianTime);
    await this.idtyDAL.trimExpiredIdentities(block.medianTime);
    await this.txsDAL.trimExpiredNonWrittenTxs(block.medianTime - common.constants.TX_WINDOW)
    return true;
  }

  savePendingMembership(ms:DBMembership) {
    return this.msDAL.savePendingMembership(ms)
  }

  async saveBlockInFile(block:DBBlock) {
    await this.writeFileOfBlock(block)
  }

  saveSideBlockInFile(block:DBBlock) {
    return this.writeSideFileOfBlock(block)
  }

  async saveTxsInFiles(txs:TransactionDTO[], block_number:number, medianTime:number) {
    return Promise.all(txs.map(async (tx) => {
      const sp = tx.blockstamp.split('-');
      tx.blockstampTime = (await this.getBlockByNumberAndHash(parseInt(sp[0]), sp[1])).medianTime;
      const txEntity = new Transaction(tx);
      txEntity.computeAllHashes();
      return this.txsDAL.addLinked(TransactionDTO.fromJSONObject(txEntity), block_number, medianTime);
    }))
  }

  async merkleForPeers() {
    let peers = await this.listAllPeersWithStatusNewUP();
    const leaves = peers.map((peer:DBPeer) => peer.hash);
    const merkle = new Merkle();
    merkle.initialize(leaves);
    return merkle;
  }

  removeAllSourcesOfBlock(blockstamp:string) {
    return this.sindexDAL.removeBlock(blockstamp)
  }

  updateTransactions(txs:DBTx[]) {
    return this.txsDAL.insertBatchOfTxs(txs)
  }

  savePendingIdentity(idty:DBIdentity) {
    return this.idtyDAL.saveIdentity(idty)
  }

  revokeIdentity(pubkey:string) {
    return this.idtyDAL.revokeIdentity(pubkey)
  }

  async removeUnWrittenWithPubkey(pubkey:string) {
    return await this.idtyDAL.removeUnWrittenWithPubkey(pubkey)
  }

  async removeUnWrittenWithUID(pubkey:string) {
    return await this.idtyDAL.removeUnWrittenWithUID(pubkey);
  }

  registerNewCertification(cert:DBCert) {
    return this.certDAL.saveNewCertification(cert)
  }

  saveTransaction(tx:DBTx) {
    return this.txsDAL.addPending(TransactionDTO.fromJSONObject(tx))
  }

  async getTransactionsHistory(pubkey:string) {
    const history = {
      sent: [],
      received: [],
      sending: [],
      receiving: [],
      pending: []
    };
    const res = await Promise.all([
      this.txsDAL.getLinkedWithIssuer(pubkey),
      this.txsDAL.getLinkedWithRecipient(pubkey),
      this.txsDAL.getPendingWithIssuer(pubkey),
      this.txsDAL.getPendingWithRecipient(pubkey)
    ])
    history.sent = res[0] || [];
    history.received = res[1] || [];
    history.sending = res[2] || [];
    history.pending = res[3] || [];
    return history;
  }

  async getUDHistory(pubkey:string) {
    const sources = await this.sindexDAL.getUDSources(pubkey)
    return {
      history: sources.map((src:SindexEntry) => _.extend({
        block_number: src.pos,
        time: src.written_time
      }, src))
    }
  }

  savePeer(peer:DBPeer) {
    return this.peerDAL.savePeer(peer)
  }

  async getUniqueIssuersBetween(start:number, end:number) {
    const current = await this.blockDAL.getCurrent();
    const firstBlock = Math.max(0, start);
    const lastBlock = Math.max(0, Math.min(current.number, end));
    const blocks = await this.blockDAL.getBlocks(firstBlock, lastBlock);
    return _.chain(blocks).pluck('issuer').uniq().value();
  }

  /**
   * Gets a range of entries for the last `start`th to the last `end`th HEAD entry.
   * @param start The starting entry number (min. 1)
   * @param end The ending entry (max. BINDEX length)
   * @param property If provided, transforms the range of entries into an array of the asked property.
   */
  async range(start:number, end:number, property:string) {
    const range = await this.bindexDAL.range(start, end);
    if (property) {
      // Filter on a particular property
      return range.map((b:any) => b[property]);
    } else {
      return range;
    }
  }

  /**
   * Get the last `n`th entry from the BINDEX.
   * @param n The entry number (min. 1).
   */
  head(n:number) {
    return this.bindexDAL.head(n)
  }

  /***********************
   *    CONFIGURATION
   **********************/

  getParameters() {
    return this.confDAL.getParameters()
  }

  async loadConf(overrideConf:ConfDTO, defaultConf = false) {
    let conf = Configuration.statics.complete(overrideConf || {});
    if (!defaultConf) {
      const savedConf = await this.confDAL.loadConf();
      conf = _(savedConf).extend(overrideConf || {});
    }
    if (this.loadConfHook) {
      await this.loadConfHook(conf)
    }
    return conf;
  }

  async saveConf(confToSave:ConfDTO) {
    // Save the conf in file
    let theConf = confToSave;
    if (this.saveConfHook) {
      theConf = await this.saveConfHook(theConf)
    }
    return this.confDAL.saveConf(theConf);
  }

  /***********************
   *     WALLETS
   **********************/

  async getWallet(conditions:string) {
    let wallet = await this.walletDAL.getWallet(conditions)
    if (!wallet) {
      wallet = { conditions, balance: 0 }
    }
    return wallet
  }

  saveWallet(wallet:DBWallet) {
    return this.walletDAL.saveWallet(wallet)
  }

  /***********************
   *     STATISTICS
   **********************/

  loadStats() {
    return this.statDAL.loadStats()
  }

  getStat(name:string) {
    return this.statDAL.getStat(name)
  }
  pushStats(stats:any) {
    return this.statDAL.pushStats(stats)
  }

  async cleanCaches() {
    await _.values(this.newDals).map((dal:any) => dal.cleanCache && dal.cleanCache())
  }

  async close() {
    await _.values(this.newDals).map((dal:any) => dal.cleanCache && dal.cleanCache())
    return this.sqliteDriver.closeConnection();
  }

  async resetPeers() {
    this.peerDAL.removeAll();
    return await this.close()
  }

  getLogContent(linesQuantity:number) {
    return new Promise((resolve, reject) => {
      try {
        let lines:string[] = [], i = 0;
        const logPath = path.join(this.rootPath, 'duniter.log');
        const readStream = fs.createReadStream(logPath);
        readStream.on('error', (err:any) => reject(err));
        const lineReader = readline.createInterface({
          input: readStream
        });
        lineReader.on('line', (line:string) => {
          line = "\n" + line;
          lines.push(line);
          i++;
          if (i >= linesQuantity) lines.shift();
        });
        lineReader.on('close', () => resolve(lines));
        lineReader.on('error', (err:any) => reject(err));
      } catch (e) {
        reject(e);
      }
    })
  }
}
