// Source file from duniter: Crypto-currency software to manage libre currency such as Ğ1
// Copyright (C) 2018  Cedric Moreau <cem.moreau@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

import {SQLiteDriver} from "./drivers/SQLiteDriver"
import {ConfDAL} from "./fileDALs/ConfDAL"
import {StatDAL} from "./fileDALs/StatDAL"
import {ConfDTO} from "../dto/ConfDTO"
import {BlockDTO} from "../dto/BlockDTO"
import {DBHead} from "../db/DBHead"
import {DBIdentity, IdentityDAL} from "./sqliteDAL/IdentityDAL"
import {CindexEntry, FullMindexEntry, IindexEntry, IndexEntry, SindexEntry} from "../indexer"
import {DBPeer, PeerDAL} from "./sqliteDAL/PeerDAL"
import {TransactionDTO} from "../dto/TransactionDTO"
import {CertDAL, DBCert} from "./sqliteDAL/CertDAL"
import {DBWallet, WalletDAL} from "./sqliteDAL/WalletDAL"
import {DBTx, TxsDAL} from "./sqliteDAL/TxsDAL"
import {DBBlock} from "../db/DBBlock"
import {DBMembership, MembershipDAL} from "./sqliteDAL/MembershipDAL"
import {MerkleDTO} from "../dto/MerkleDTO"
import {CommonConstants} from "../common-libs/constants"
import {PowDAL} from "./fileDALs/PowDAL";
import {Initiable} from "./sqliteDAL/Initiable"
import {MetaDAL} from "./sqliteDAL/MetaDAL"
import {BIndexDAL} from "./sqliteDAL/index/BIndexDAL"
import {MIndexDAL} from "./sqliteDAL/index/MIndexDAL"
import {CIndexDAL} from "./sqliteDAL/index/CIndexDAL"
import {SIndexDAL} from "./sqliteDAL/index/SIndexDAL"
import {IIndexDAL} from "./sqliteDAL/index/IIndexDAL"
import {DataErrors} from "../common-libs/errors"
import {BasicRevocableIdentity, IdentityDTO} from "../dto/IdentityDTO"
import {BlockDAL} from "./sqliteDAL/BlockDAL"
import {FileSystem} from "../system/directory"

const fs      = require('fs')
const path    = require('path')
const readline = require('readline')
const _       = require('underscore');
const indexer = require('../indexer').Indexer
const logger = require('../logger').NewLogger('filedal');
const constants = require('../constants');

export interface FileDALParams {
  home:string
  fs:FileSystem
  dbf:() => SQLiteDriver
  wotb:any
}

export class FileDAL {

  rootPath:string
  myFS:any
  sqliteDriver:SQLiteDriver
  wotb:any
  profile:string

  powDAL:PowDAL
  confDAL:ConfDAL
  metaDAL:MetaDAL
  peerDAL:PeerDAL
  blockDAL:BlockDAL
  txsDAL:TxsDAL
  statDAL:StatDAL
  idtyDAL:IdentityDAL
  certDAL:CertDAL
  msDAL:MembershipDAL
  walletDAL:WalletDAL
  bindexDAL:BIndexDAL
  mindexDAL:MIndexDAL
  iindexDAL:IIndexDAL
  sindexDAL:SIndexDAL
  cindexDAL:CIndexDAL
  newDals:{ [k:string]: Initiable }

  loadConfHook: (conf:ConfDTO) => Promise<void>
  saveConfHook: (conf:ConfDTO) => Promise<ConfDTO>

  constructor(params:FileDALParams) {
    this.rootPath = params.home
    this.myFS = params.fs
    this.sqliteDriver = params.dbf()
    this.wotb = params.wotb
    this.profile = 'DAL'

    // DALs
    this.powDAL = new PowDAL(this.rootPath, this.myFS)
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
      'powDAL': this.powDAL,
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
      return await this.peerDAL.getPeer(pubkey)
    } catch (err) {
      throw Error('Unknown peer ' + pubkey);
    }
  }

  async getWS2Peers() {
    return  this.peerDAL.getPeersWithEndpointsLike('WS2P')
  }

  async getBlock(number:number) {
    const block = await this.blockDAL.getBlock(number)
    return block || null;
  }

  getAbsoluteBlockByNumberAndHash(number:number, hash:string) {
    return this.blockDAL.getAbsoluteBlock(number, hash)
  }

  getAbsoluteBlockByBlockstamp(blockstamp:string) {
    if (!blockstamp) throw "Blockstamp is required to find the block"
    const sp = blockstamp.split('-')
    const number = parseInt(sp[0])
    const hash = sp[1]
    return this.getAbsoluteBlockByNumberAndHash(number, hash)
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

  getPotentialRootBlocks() {
    return this.blockDAL.getPotentialRoots()
  }

  lastBlockOfIssuer(issuer:string) {
    return this.blockDAL.lastBlockOfIssuer(issuer);
  }
  
  getCountOfPoW(issuer:string) {
    return this.blockDAL.getCountOfBlocksIssuedBy(issuer)
  }

  getBlocksBetween (start:number, end:number) {
    return this.blockDAL.getBlocks(Math.max(0, start), end)
  }

  getForkBlocksFollowing(current:DBBlock) {
    return this.blockDAL.getNextForkBlocks(current.number, current.hash)
  }

  getPotentialForkBlocks(numberStart:number, medianTimeStart:number, maxNumber:number) {
    return this.blockDAL.getPotentialForkBlocks(numberStart, medianTimeStart, maxNumber)
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

  async getGlobalIdentityByHashForExistence(hash:string): Promise<boolean> {
    const pending = await this.idtyDAL.getByHash(hash)
    if (!pending) {
      const idty = await this.iindexDAL.getFullFromHash(hash)
      if (!idty) {
        return false
      }
    }
    return true
  }

  async getGlobalIdentityByHashForHashingAndSig(hash:string): Promise<{ pubkey:string, uid:string, buid:string, sig:string }|null> {
    const pending = await this.idtyDAL.getByHash(hash)
    if (!pending) {
      const idty = await this.iindexDAL.getFullFromHash(hash)
      if (!idty) {
        return null
      }
      return {
        pubkey: idty.pub,
        uid: idty.uid,
        buid: idty.created_on,
        sig: idty.sig
      }
    }
    return pending
  }

  async getGlobalIdentityByHashForLookup(hash:string): Promise<{ pubkey:string, uid:string, buid:string, sig:string, member:boolean, wasMember:boolean }|null> {
    const pending = await this.idtyDAL.getByHash(hash)
    if (!pending) {
      const idty = await this.iindexDAL.getFullFromHash(hash)
      if (!idty) {
        return null
      }
      return {
        pubkey: idty.pub,
        uid: idty.uid,
        buid: idty.created_on,
        sig: idty.sig,
        member: idty.member,
        wasMember: idty.wasMember
      }
    }
    return pending
  }

  async getGlobalIdentityByHashForJoining(hash:string): Promise<{ pubkey:string, uid:string, buid:string, sig:string, member:boolean, wasMember:boolean, revoked:boolean }|null> {
    const pending = await this.idtyDAL.getByHash(hash)
    if (!pending) {
      const idty = await this.iindexDAL.getFullFromHash(hash)
      if (!idty) {
        return null
      }
      const membership = await this.mindexDAL.getReducedMS(idty.pub) as FullMindexEntry
      return {
        pubkey: idty.pub,
        uid: idty.uid,
        buid: idty.created_on,
        sig: idty.sig,
        member: idty.member,
        wasMember: idty.wasMember,
        revoked: !!(membership.revoked_on)
      }
    }
    return pending
  }

  async getGlobalIdentityByHashForIsMember(hash:string): Promise<{ pub:string, member:boolean }|null> {
    const pending = await this.idtyDAL.getByHash(hash)
    if (!pending) {
      const idty = await this.iindexDAL.getFullFromHash(hash)
      if (!idty) {
        return null
      }
      return {
        pub: idty.pub,
        member: idty.member
      }
    }
    return {
      pub: pending.pubkey,
      member: pending.member
    }
  }

  async getGlobalIdentityByHashForRevocation(hash:string): Promise<{ pub:string, uid:string, created_on:string, sig:string, member:boolean, wasMember:boolean, revoked:boolean, revocation_sig:string|null, expires_on:number }|null> {
    const pending = await this.idtyDAL.getByHash(hash)
    if (!pending) {
      const idty = await this.iindexDAL.getFullFromHash(hash)
      if (!idty) {
        return null
      }
      const membership = await this.mindexDAL.getReducedMS(idty.pub) as FullMindexEntry
      return {
        pub: idty.pub,
        uid: idty.uid,
        sig: idty.sig,
        member: idty.member,
        wasMember: idty.wasMember,
        expires_on: membership.expires_on,
        created_on: idty.created_on,
        revoked: !!(membership.revoked_on),
        revocation_sig: membership.revocation
      }
    }
    return {
      pub: pending.pubkey,
      uid: pending.uid,
      sig: pending.sig,
      expires_on: pending.expires_on,
      created_on: pending.buid,
      member: pending.member,
      wasMember: pending.wasMember,
      revoked: pending.revoked,
      revocation_sig: pending.revocation_sig
    }
  }

  getMembers() {
    return this.iindexDAL.getMembers()
  }

  async getWrittenIdtyByPubkeyForHash(pubkey:string): Promise<{ hash:string }> {
    return this.getWrittenForSureIdtyByPubkey(pubkey)
  }

  async getWrittenIdtyByPubkeyForHashing(pubkey:string): Promise<{ uid:string, created_on:string, pub:string }> {
    return this.getWrittenForSureIdtyByPubkey(pubkey)
  }

  async getWrittenIdtyByPubkeyForWotbID(pubkey:string): Promise<{ wotb_id:number }> {
    return this.getWrittenForSureIdtyByPubkey(pubkey)
  }

  async getWrittenIdtyByPubkeyForUidAndPubkey(pubkey:string): Promise<{ pub:string, uid:string }> {
    return this.getWrittenForSureIdtyByPubkey(pubkey)
  }

  async getWrittenIdtyByPubkeyForIsMember(pubkey:string): Promise<{ member:boolean }|null> {
    return this.iindexDAL.getFromPubkey(pubkey)
  }

  async getWrittenIdtyByPubkeyForUidAndIsMemberAndWasMember(pubkey:string): Promise<{ uid:string, member:boolean, wasMember:boolean }|null> {
    return this.iindexDAL.getFromPubkey(pubkey)
  }

  async getWrittenIdtyByPubkeyOrUidForIsMemberAndPubkey(search:string): Promise<{ pub:string, member:boolean }|null> {
    return this.iindexDAL.getFromPubkeyOrUid(search)
  }

  async getWrittenIdtyByPubkeyOrUIdForHashingAndIsMember(search:string): Promise<{ uid:string, created_on:string, pub:string, member:boolean }|null> {
    return await this.iindexDAL.getFromPubkeyOrUid(search)
  }

  async getWrittenIdtyByPubkeyForRevocationCheck(pubkey:string): Promise<{ pub:string, uid:string, created_on:string, sig:string, revoked_on:number|null }|null> {
    const idty = await this.iindexDAL.getFromPubkey(pubkey)
    if (!idty) {
      return null
    }
    const membership = await this.mindexDAL.getReducedMS(pubkey) as FullMindexEntry
    return {
      pub: idty.pub,
      uid: idty.uid,
      sig: idty.sig,
      created_on: idty.created_on,
      revoked_on: membership.revoked_on
    }
  }

  async getWrittenIdtyByPubkeyForCertificationCheck(pubkey:string): Promise<{ pub:string, uid:string, created_on:string, sig:string }|null> {
    const idty = await this.iindexDAL.getFromPubkey(pubkey)
    if (!idty) {
      return null
    }
    return {
      pub: idty.pub,
      uid: idty.uid,
      sig: idty.sig,
      created_on: idty.created_on,
    }
  }

  async getWrittenIdtyByPubkeyForUidAndMemberAndCreatedOn(pubkey:string): Promise<{ uid:string, member:boolean, created_on:string }|null> {
    const idty = await this.iindexDAL.getFromPubkey(pubkey)
    if (!idty) {
      return null
    }
    return {
      uid: idty.uid,
      member: idty.member,
      created_on: idty.created_on,
    }
  }

  private async getWrittenForSureIdtyByPubkey(pubkey:string) {
    const idty = await this.iindexDAL.getFromPubkey(pubkey)
    if (!idty) {
      throw Error(DataErrors[DataErrors.MEMBER_NOT_FOUND])
    }
    return idty
  }

  private async getWrittenForSureIdtyByUid(pubkey:string) {
    const idty = (await this.iindexDAL.getFullFromUID(pubkey))
    if (!idty) {
      throw Error(DataErrors[DataErrors.MEMBER_NOT_FOUND])
    }
    return idty
  }

  async getWrittenIdtyByPubkeyForExistence(uid:string) {
    return !!(await this.iindexDAL.getFromPubkey(uid))
  }

  async getWrittenIdtyByUIDForExistence(uid:string) {
    return !!(await this.iindexDAL.getFromUID(uid))
  }

  async getWrittenIdtyByUidForHashing(uid:string): Promise<{ uid:string, created_on:string, pub:string }> {
    return this.getWrittenForSureIdtyByUid(uid)
  }

  async getWrittenIdtyByUIDForWotbId(uid:string): Promise<{ wotb_id:number }> {
    return this.getWrittenForSureIdtyByUid(uid)
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

  getTransactionsPending(versionMin = 0) {
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
      const idty = await this.getWrittenIdtyByPubkeyForRevocationCheck(pending.pubkey)
      if (idty && !idty.revoked_on) {
        toRevoke.push(pending);
      }
    }
    return toRevoke;
  }

  getToBeKickedPubkeys() {
    return this.iindexDAL.getToBeKickedPubkeys()
  }

  getRevokedPubkeys() {
    return this.mindexDAL.getRevokedPubkeys()
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
        f.revoked_on = ms.revoked_on ? ms.revoked_on : null;
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
      const idty = await this.getWrittenIdtyByPubkeyForHash(entry.receiver)
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

  async findNewcomers(blockMedianTime = 0) {
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

  async findLeavers(blockMedianTime = 0) {
    const pending = await this.msDAL.getPendingOUT();
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
      .value();
  }

  existsNonReplayableLink(from:string, to:string) {
    return  this.cindexDAL.existsNonReplayableLink(from, to)
  }

  getSource(identifier:string, pos:number) {
    return this.sindexDAL.getSource(identifier, pos)
  }

  async isMember(pubkey:string):Promise<boolean> {
    try {
      const idty = await this.iindexDAL.getFromPubkey(pubkey);
      if (idty === null) {
        return false
      }
      return true;
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
    return await this.idtyDAL.setRevoked(pubkey)
  }

  setRevocating = (idty:BasicRevocableIdentity, revocation_sig:string) => {
    const dbIdentity = IdentityDTO.fromBasicIdentity(idty)
    dbIdentity.member = idty.member
    dbIdentity.wasMember = idty.wasMember
    dbIdentity.expires_on = idty.expires_on
    dbIdentity.revocation_sig = revocation_sig
    dbIdentity.revoked = false
    return this.idtyDAL.saveIdentity(dbIdentity)
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

  async removePeerByPubkey(pubkey:string) {
    return this.peerDAL.removePeerByPubkey(pubkey)
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

  async findPeers(pubkey:string): Promise<DBPeer[]> {
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
      const from = await this.getWrittenIdtyByPubkeyForWotbID(entry.issuer);
      const to = await this.getWrittenIdtyByPubkeyForWotbID(entry.receiver);
      if (entry.op == CommonConstants.IDX_CREATE) {
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
    await this.txsDAL.trimExpiredNonWrittenTxs(block.medianTime - CommonConstants.TX_WINDOW)
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
      const txEntity = TransactionDTO.fromJSONObject(tx)
      txEntity.computeAllHashes();
      return this.txsDAL.addLinked(TransactionDTO.fromJSONObject(txEntity), block_number, medianTime);
    }))
  }

  async merkleForPeers() {
    let peers = await this.listAllPeersWithStatusNewUP();
    const leaves = peers.map((peer:DBPeer) => peer.hash);
    const merkle = new MerkleDTO();
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
    return this.txsDAL.addPending(tx)
  }

  async getTransactionsHistory(pubkey:string) {
    const history:{
      sent: DBTx[]
      received: DBTx[]
      sending: DBTx[]
      receiving: DBTx[]
      pending: DBTx[]
    } = {
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
    let conf = ConfDTO.complete(overrideConf || {});
    if (!defaultConf) {
      const savedConf = await this.confDAL.loadConf();
      const savedProxyConf = _(savedConf.proxyConf).extend({});
      conf = _(savedConf).extend(overrideConf || {});
      if (overrideConf.proxiesConf !== undefined) {} else {
        conf.proxyConf = _(savedProxyConf).extend({});
      }
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
