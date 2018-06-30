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

import * as fs from 'fs'
import * as path from 'path'
import {SQLiteDriver} from "./drivers/SQLiteDriver"
import {ConfDAL} from "./fileDALs/ConfDAL"
import {StatDAL} from "./fileDALs/StatDAL"
import {ConfDTO} from "../dto/ConfDTO"
import {BlockDTO} from "../dto/BlockDTO"
import {DBHead} from "../db/DBHead"
import {DBIdentity, IdentityDAL} from "./sqliteDAL/IdentityDAL"
import {
  CindexEntry,
  FullCindexEntry,
  FullIindexEntry,
  FullMindexEntry,
  IindexEntry,
  IndexEntry,
  MindexEntry,
  SimpleTxInput,
  SimpleUdEntryForWallet,
  SindexEntry
} from "../indexer"
import {TransactionDTO} from "../dto/TransactionDTO"
import {CertDAL, DBCert} from "./sqliteDAL/CertDAL"
import {DBBlock} from "../db/DBBlock"
import {DBMembership, MembershipDAL} from "./sqliteDAL/MembershipDAL"
import {MerkleDTO} from "../dto/MerkleDTO"
import {CommonConstants} from "../common-libs/constants"
import {PowDAL} from "./fileDALs/PowDAL";
import {Initiable} from "./sqliteDAL/Initiable"
import {MetaDAL} from "./sqliteDAL/MetaDAL"
import {DataErrors} from "../common-libs/errors"
import {BasicRevocableIdentity, IdentityDTO} from "../dto/IdentityDTO"
import {FileSystem} from "../system/directory"
import {WoTBInstance} from "../wot"
import {IIndexDAO} from "./indexDAL/abstract/IIndexDAO"
import {LokiIIndex} from "./indexDAL/loki/LokiIIndex"
import {BIndexDAO} from "./indexDAL/abstract/BIndexDAO"
import {MIndexDAO} from "./indexDAL/abstract/MIndexDAO"
import {SIndexDAO} from "./indexDAL/abstract/SIndexDAO"
import {CIndexDAO} from "./indexDAL/abstract/CIndexDAO"
import {IdentityForRequirements} from "../../service/BlockchainService"
import {LokiSIndex} from "./indexDAL/loki/LokiSIndex"
import {LokiCIndex} from "./indexDAL/loki/LokiCIndex"
import {LokiMIndex} from "./indexDAL/loki/LokiMIndex";
import {LokiBIndex} from "./indexDAL/loki/LokiBIndex"
import {NewLogger} from "../logger"
import {LokiBlockchain} from "./indexDAL/loki/LokiBlockchain"
import {BlockchainDAO} from "./indexDAL/abstract/BlockchainDAO"
import {LokiTransactions} from "./indexDAL/loki/LokiTransactions"
import {TxsDAO} from "./indexDAL/abstract/TxsDAO"
import {LokiJsDriver} from "./drivers/LokiJsDriver"
import {WalletDAO} from "./indexDAL/abstract/WalletDAO"
import {LokiWallet} from "./indexDAL/loki/LokiWallet"
import {PeerDAO} from "./indexDAL/abstract/PeerDAO"
import {LokiPeer} from "./indexDAL/loki/LokiPeer"
import {DBTx} from "../db/DBTx"
import {DBWallet} from "../db/DBWallet"
import {Tristamp} from "../common/Tristamp"
import {CFSBlockchainArchive} from "./indexDAL/CFSBlockchainArchive"
import {CFSCore} from "./fileDALs/CFSCore"
import {BlockchainArchiveDAO} from "./indexDAL/abstract/BlockchainArchiveDAO"
import {Underscore} from "../common-libs/underscore"
import {DBPeer} from "../db/DBPeer"
import {MonitorFlushedIndex} from "../debug/MonitorFlushedIndex"
import {cliprogram} from "../common-libs/programOptions"
import {DividendDAO, UDSource} from "./indexDAL/abstract/DividendDAO"
import {LokiDividend} from "./indexDAL/loki/LokiDividend"
import {HttpSource, HttpUD} from "../../modules/bma/lib/dtos"

const readline = require('readline')
const indexer = require('../indexer').Indexer
const logger = require('../logger').NewLogger('filedal');
const constants = require('../constants');

export interface FileDALParams {
  home:string
  fs:FileSystem
  dbf:() => SQLiteDriver
  dbf2: () => LokiJsDriver
  wotb:WoTBInstance
}

export interface IndexBatch {
  mindex: MindexEntry[]
  iindex: IindexEntry[]
  sindex: SindexEntry[]
  cindex: CindexEntry[]
}

export class FileDAL {

  rootPath:string
  fs: FileSystem
  loki:LokiJsDriver
  sqliteDriver:SQLiteDriver
  wotb:WoTBInstance
  profile:string

  // Simple file accessors
  powDAL:PowDAL
  confDAL:ConfDAL
  statDAL:StatDAL
  blockchainArchiveDAL:BlockchainArchiveDAO<DBBlock>

  // SQLite DALs
  metaDAL:MetaDAL
  idtyDAL:IdentityDAL
  certDAL:CertDAL
  msDAL:MembershipDAL

  // New DAO entities
  blockDAL:BlockchainDAO
  txsDAL:TxsDAO
  peerDAL:PeerDAO
  walletDAL:WalletDAO
  bindexDAL:BIndexDAO
  mindexDAL:MIndexDAO
  iindexDAL:IIndexDAO
  sindexDAL:SIndexDAO
  cindexDAL:CIndexDAO
  dividendDAL:DividendDAO
  newDals:{ [k:string]: Initiable }

  loadConfHook: (conf:ConfDTO) => Promise<void>
  saveConfHook: (conf:ConfDTO) => Promise<ConfDTO>

  constructor(params:FileDALParams) {
    this.rootPath = params.home
    this.sqliteDriver = params.dbf()
    this.loki = params.dbf2()
    this.wotb = params.wotb
    this.profile = 'DAL'
    this.fs = params.fs

    // DALs
    this.powDAL = new PowDAL(this.rootPath, params.fs)
    this.confDAL = new ConfDAL(this.rootPath, params.fs)
    this.metaDAL = new (require('./sqliteDAL/MetaDAL').MetaDAL)(this.sqliteDriver);
    this.blockchainArchiveDAL = new CFSBlockchainArchive(new CFSCore(path.join(this.rootPath, '/archives'), params.fs), CommonConstants.CONST_BLOCKS_CHUNK)
    this.blockDAL = new LokiBlockchain(this.loki.getLokiInstance())
    this.txsDAL = new LokiTransactions(this.loki.getLokiInstance())
    this.statDAL = new StatDAL(this.rootPath, params.fs)
    this.idtyDAL = new (require('./sqliteDAL/IdentityDAL').IdentityDAL)(this.sqliteDriver);
    this.certDAL = new (require('./sqliteDAL/CertDAL').CertDAL)(this.sqliteDriver);
    this.msDAL = new (require('./sqliteDAL/MembershipDAL').MembershipDAL)(this.sqliteDriver);
    this.peerDAL = new LokiPeer(this.loki.getLokiInstance())
    this.walletDAL = new LokiWallet(this.loki.getLokiInstance())
    this.bindexDAL = new LokiBIndex(this.loki.getLokiInstance())
    this.mindexDAL = new LokiMIndex(this.loki.getLokiInstance())
    this.iindexDAL = new LokiIIndex(this.loki.getLokiInstance())
    this.sindexDAL = new LokiSIndex(this.loki.getLokiInstance())
    this.cindexDAL = new LokiCIndex(this.loki.getLokiInstance())
    this.dividendDAL = new LokiDividend(this.loki.getLokiInstance())

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
      'cindexDAL': this.cindexDAL,
      'dividendDAL': this.dividendDAL,
      'blockchainArchiveDAL': this.blockchainArchiveDAL,
    }
  }

  async init(conf:ConfDTO) {
    // Init LokiJS
    await this.loki.loadDatabase()
    const dals = [
      this.blockDAL,
      this.txsDAL,
      this.peerDAL,
      this.walletDAL,
      this.bindexDAL,
      this.mindexDAL,
      this.iindexDAL,
      this.sindexDAL,
      this.cindexDAL,
      this.dividendDAL,
      this.blockchainArchiveDAL,
    ]
    for (const indexDAL of dals) {
      indexDAL.triggerInit()
    }
    const dalNames = Underscore.keys(this.newDals);
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

  /**
   * Transfer a chunk of blocks from memory DB to archives if the memory DB overflows.
   * @returns {Promise<void>}
   */
  async archiveBlocks() {
    const lastArchived = await this.blockchainArchiveDAL.getLastSavedBlock()
    const current = await this.blockDAL.getCurrent()
    const lastNumber = lastArchived ? lastArchived.number : -1
    const currentNumber = current ? current.number : -1
    const difference = currentNumber - lastNumber
    if (difference > CommonConstants.BLOCKS_IN_MEMORY_MAX) {
      const CHUNK_SIZE = this.blockchainArchiveDAL.chunkSize
      const nbBlocksOverflow = difference - CommonConstants.BLOCKS_IN_MEMORY_MAX
      const chunks = (nbBlocksOverflow - (nbBlocksOverflow % CHUNK_SIZE)) / CHUNK_SIZE
      for (let i = 0; i < chunks; i++) {
        const start = lastNumber + (i*CHUNK_SIZE) + 1
        const end = lastNumber + (i*CHUNK_SIZE) + CHUNK_SIZE
        const memBlocks = await this.blockDAL.getNonForkChunk(start, end)
        if (memBlocks.length !== CHUNK_SIZE) {
          throw Error(DataErrors[DataErrors.CANNOT_ARCHIVE_CHUNK_WRONG_SIZE])
        }
        await this.blockchainArchiveDAL.archive(memBlocks)
        await this.blockDAL.trimBlocks(end)
      }
    }
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

  getAbsoluteBlockInForkWindowByBlockstamp(blockstamp:string) {
    if (!blockstamp) throw "Blockstamp is required to find the block";
    const sp = blockstamp.split('-');
    const number = parseInt(sp[0]);
    const hash = sp[1];
    return this.getAbsoluteBlockInForkWindow(number, hash)
  }

  getAbsoluteValidBlockInForkWindowByBlockstamp(blockstamp:string) {
    if (!blockstamp) throw "Blockstamp is required to find the block";
    const sp = blockstamp.split('-');
    const number = parseInt(sp[0]);
    const hash = sp[1];
    return this.getAbsoluteValidBlockInForkWindow(number, hash)
  }

  async getBlockWeHaveItForSure(number:number): Promise<DBBlock> {
    return (await this.blockDAL.getBlock(number)) as DBBlock || (await this.blockchainArchiveDAL.getBlockByNumber(number))
  }

  // Duniter-UI dependency
  async getBlock(number: number): Promise<DBBlock|null> {
    return this.getFullBlockOf(number)
  }

  async getFullBlockOf(number: number): Promise<DBBlock|null> {
    return (await this.blockDAL.getBlock(number)) || (await this.blockchainArchiveDAL.getBlockByNumber(number))
  }

  async getBlockstampOf(number: number): Promise<string|null> {
    const block = await this.getTristampOf(number)
    if (block) {
      return [block.number, block.hash].join('-')
    }
    return null
  }

  async getTristampOf(number: number): Promise<Tristamp|null> {
    return (await this.blockDAL.getBlock(number)) || (await this.blockchainArchiveDAL.getBlockByNumber(number))
  }

  async existsAbsoluteBlockInForkWindow(number:number, hash:string): Promise<boolean> {
    return !!(await this.getAbsoluteBlockByNumberAndHash(number, hash))
  }

  async getAbsoluteBlockInForkWindow(number:number, hash:string): Promise<DBBlock|null> {
    return this.getAbsoluteBlockByNumberAndHash(number, hash)
  }

  async getAbsoluteValidBlockInForkWindow(number:number, hash:string): Promise<DBBlock|null> {
    const block = await this.getAbsoluteBlockByNumberAndHash(number, hash)
    if (block && !block.fork) {
      return block
    }
    return null
  }

  async getAbsoluteBlockByNumberAndHash(number:number, hash:string): Promise<DBBlock|null> {
    return (await this.blockDAL.getAbsoluteBlock(number, hash)) || (await this.blockchainArchiveDAL.getBlock(number, hash))
  }

  async getAbsoluteBlockByBlockstamp(blockstamp: string): Promise<DBBlock|null> {
    const sp = blockstamp.split('-')
    return this.getAbsoluteBlockByNumberAndHash(parseInt(sp[0]), sp[1])
  }

  async existsNonChainableLink(from:string, vHEAD_1:DBHead, sigStock:number) {
    // Cert period rule
    const medianTime = vHEAD_1 ? vHEAD_1.medianTime : 0;
    const linksFrom:FullCindexEntry[] = await this.cindexDAL.reducablesFrom(from)
    const unchainables = Underscore.filter(linksFrom, (link:CindexEntry) => link.chainable_on > medianTime);
    if (unchainables.length > 0) return true;
    // Max stock rule
    let activeLinks = Underscore.filter(linksFrom, (link:CindexEntry) => !link.expired_on);
    return activeLinks.length >= sigStock;
  }


  async getCurrentBlockOrNull() {
    let current:DBBlock|null = null;
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
    return this.getFullBlockOf(number)
  }

  // Block

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

  async getAvailableSourcesByPubkey(pubkey:string): Promise<HttpSource[]> {
    const txAvailable = await this.sindexDAL.getAvailableForPubkey(pubkey)
    const sources: UDSource[] = await this.dividendDAL.getUDSources(pubkey)
    return sources.map(d => {
      return {
        type: 'D',
        noffset: d.pos,
        identifier: pubkey,
        amount: d.amount,
        base: d.base,
        conditions: 'SIG(' + pubkey + ')'
      }
    }).concat(txAvailable.map(s => {
      return {
        type: 'T',
        noffset: s.pos,
        identifier: s.identifier,
        amount: s.amount,
        base: s.base,
        conditions: s.conditions
      }
    }))
  }

  async findByIdentifierPosAmountBase(identifier: string, pos: number, amount: number, base: number, isDividend: boolean): Promise<SimpleTxInput[]> {
    if (isDividend) {
      return this.dividendDAL.findUdSourceByIdentifierPosAmountBase(identifier, pos, amount, base)
    } else {
      return this.sindexDAL.findTxSourceByIdentifierPosAmountBase(identifier, pos, amount, base)
    }
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

  // Duniter-UI dependency
  async getWrittenIdtyByPubkey(pub:string): Promise<FullIindexEntry | null> {
    return await this.iindexDAL.getFromPubkey(pub)
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
    return Underscore.chain(peers).filter((p:DBPeer) => hashes.indexOf(p.hash) !== -1).value()
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
    return Underscore.chain(pending).where({pubkey: pubkey}).value()
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

  async searchJustIdentities(search:string): Promise<DBIdentity[]> {
    const pendings = await this.idtyDAL.searchThoseMatching(search);
    const writtens = await this.iindexDAL.searchThoseMatching(search);
    const nonPendings = Underscore.filter(writtens, (w:IindexEntry) => {
      return Underscore.where(pendings, { pubkey: w.pub }).length == 0;
    });
    const found = pendings.concat(nonPendings.map((i:any) => {
      // Use the correct field
      i.pubkey = i.pub
      return i
    }));
    return await Promise.all<DBIdentity>(found.map(async (f:any) => {
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
      matching.push(await this.cindexEntry2DBCert(entry))
    }))
    matching  = Underscore.sortBy(matching, (c:DBCert) => -c.block);
    matching.reverse();
    return matching;
  }

  async certsFrom(pubkey:string) {
    const certs = await this.certDAL.getFromPubkeyCerts(pubkey);
    const links = await this.cindexDAL.getValidLinksFrom(pubkey);
    let matching = certs;
    await Promise.all(links.map(async (entry:CindexEntry) => {
      matching.push(await this.cindexEntry2DBCert(entry))
    }))
    matching  = Underscore.sortBy(matching, (c:DBCert) => -c.block);
    matching.reverse();
    return matching;
  }

  async cindexEntry2DBCert(entry:CindexEntry): Promise<DBCert> {
    const idty = await this.getWrittenIdtyByPubkeyForHash(entry.receiver)
    const wbt = entry.written_on.split('-')
    const block = (await this.blockDAL.getBlock(entry.created_on)) as DBBlock
    return {
      issuers: [entry.issuer],
      linked: true,
      written: true,
      written_block: parseInt(wbt[0]),
      written_hash: wbt[1],
      sig: entry.sig,
      block_number: block.number,
      block_hash: block.hash,
      target: idty.hash,
      to: entry.receiver,
      from: entry.issuer,
      block: block.number,
      expired: !!entry.expired_on,
      expires_on: entry.expires_on,
    }
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
    return Underscore.chain(certs).where({linked: false}).sortBy((c:DBCert) => -c.block).value()
  }

  async certsNotLinkedToTarget(hash:string) {
    const certs = await this.certDAL.getNotLinkedToTarget(hash);
    return Underscore.chain(certs).sortBy((c:any) => -c.block).value();
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
    return Underscore.sortBy(pending, (ms:any) => -ms.number)[0];
  }

  async findNewcomers(blockMedianTime = 0): Promise<DBMembership[]> {
    const pending = await this.msDAL.getPendingIN()
    const mss: DBMembership[] = await Promise.all<DBMembership>(pending.map(async (p:any) => {
      const reduced = await this.mindexDAL.getReducedMS(p.issuer)
      if (!reduced || !reduced.chainable_on || blockMedianTime >= reduced.chainable_on || blockMedianTime < constants.TIME_TO_TURN_ON_BRG_107) {
        return p
      }
      return null
    }))
    return Underscore.chain(Underscore.filter(mss, ms => !!ms) as DBMembership[])
      .sortBy((ms:DBMembership) => -ms.blockNumber)
      .value()
  }

  async findLeavers(blockMedianTime = 0): Promise<DBMembership[]> {
    const pending = await this.msDAL.getPendingOUT();
    const mss = await Promise.all<DBMembership|null>(pending.map(async p => {
      const reduced = await this.mindexDAL.getReducedMS(p.issuer)
      if (!reduced || !reduced.chainable_on || blockMedianTime >= reduced.chainable_on || blockMedianTime < constants.TIME_TO_TURN_ON_BRG_107) {
        return p
      }
      return null
    }))
    return Underscore.chain(Underscore.filter(mss, ms => !!ms) as DBMembership[])
      .sortBy(ms => -ms.blockNumber)
      .value();
  }

  existsNonReplayableLink(from:string, to:string) {
    return  this.cindexDAL.existsNonReplayableLink(from, to)
  }

  async getSource(identifier:string, pos:number, isDividend: boolean): Promise<SimpleTxInput | null> {
    if (isDividend) {
      return this.dividendDAL.getUDSource(identifier, pos)
    } else {
      return this.sindexDAL.getTxSource(identifier, pos)
    }
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
    return Underscore.chain(peers)
        .filter((p:DBPeer) => ['UP']
            .indexOf(p.status) !== -1).value();
  }

  async listAllPeersWithStatusNewUPWithtout(pub:string) {
    const peers = await this.peerDAL.listAll();
    return Underscore.chain(peers).filter((p:DBPeer) => p.status == 'UP').filter((p:DBPeer) => p.pubkey !== pub).value();
  }

  async findPeers(pubkey:string): Promise<DBPeer[]> {
    try {
      const peer = await this.getPeer(pubkey);
      return [peer];
    } catch (err) {
      return [];
    }
  }

  async getRandomlyUPsWithout(pubkeys:string[]): Promise<DBPeer[]> {
    const peers = await this.listAllPeersWithStatusNewUP();
    return peers.filter(peer => pubkeys.indexOf(peer.pubkey) == -1)
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

  async saveBlock(dbb:DBBlock) {
    dbb.wrong = false;
    await Promise.all([
      this.saveBlockInFile(dbb),
      this.saveTxsInFiles(dbb.transactions, dbb.number, dbb.medianTime)
    ])
  }

  async generateIndexes(block:BlockDTO, conf:ConfDTO, index:IndexEntry[], aHEAD:DBHead|null) {
    // We need to recompute the indexes for block#0
    let HEAD:DBHead
    if (!index || !aHEAD || aHEAD.number == 0) {
      index = indexer.localIndex(block, conf)
      HEAD = await indexer.completeGlobalScope(block, conf, index, this)
    } else {
      HEAD = aHEAD
    }
    let mindex = indexer.mindex(index);
    let iindex = indexer.iindex(index);
    let sindex = indexer.sindex(index);
    let cindex = indexer.cindex(index);
    const dividends = await indexer.ruleIndexGenDividend(HEAD, iindex, this) // Requires that newcomers are already in DividendDAO
    sindex = sindex.concat(await indexer.ruleIndexGarbageSmallAccounts(HEAD, sindex, dividends, this));
    cindex = cindex.concat(await indexer.ruleIndexGenCertificationExpiry(HEAD, this));
    mindex = mindex.concat(await indexer.ruleIndexGenMembershipExpiry(HEAD, this));
    iindex = iindex.concat(await indexer.ruleIndexGenExclusionByMembership(HEAD, mindex, this));
    iindex = iindex.concat(await indexer.ruleIndexGenExclusionByCertificatons(HEAD, cindex, iindex, conf, this));
    mindex = mindex.concat(await indexer.ruleIndexGenImplicitRevocation(HEAD, this));
    await indexer.ruleIndexCorrectMembershipExpiryDate(HEAD, mindex, this);
    await indexer.ruleIndexCorrectCertificationExpiryDate(HEAD, cindex, this);
    return { HEAD, mindex, iindex, sindex, cindex, dividends };
  }

  async updateWotbLinks(cindex:CindexEntry[]) {
    for (const entry of cindex) {
      const from = await this.getWrittenIdtyByPubkeyForWotbID(entry.issuer);
      const to = await this.getWrittenIdtyByPubkeyForWotbID(entry.receiver);
      if (entry.op == CommonConstants.IDX_CREATE) {
        // NewLogger().trace('addLink %s -> %s', from.wotb_id, to.wotb_id)
        this.wotb.addLink(from.wotb_id, to.wotb_id);
      } else {
        // Update = removal
        NewLogger().trace('removeLink %s -> %s', from.wotb_id, to.wotb_id)
        this.wotb.removeLink(from.wotb_id, to.wotb_id);
      }
    }
  }

  async trimIndexes(maxNumber:number) {
    if (!cliprogram.notrim) {
      await this.bindexDAL.trimBlocks(maxNumber)
      await this.iindexDAL.trimRecords(maxNumber)
      await this.mindexDAL.trimRecords(maxNumber)
      await this.cindexDAL.trimExpiredCerts(maxNumber)
      await this.sindexDAL.trimConsumedSource(maxNumber)
      await this.dividendDAL.trimConsumedUDs(maxNumber)
    }
  }

  async trimSandboxes(block:{ medianTime: number }) {
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
      const basedBlock = (await this.getAbsoluteBlockByNumberAndHash(parseInt(sp[0]), sp[1])) as DBBlock
      tx.blockstampTime = basedBlock.medianTime;
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

  async getUDHistory(pubkey:string): Promise<{ history: HttpUD[] }> {
    const sources: UDSource[] = await this.dividendDAL.getUDSources(pubkey)
    return {
      history: (await Promise.all<HttpUD>(sources.map(async (src) => {
        const block = await this.getBlockWeHaveItForSure(src.pos)
        return {
          block_number: src.pos,
          time: block.medianTime,
          consumed: src.consumed,
          amount: src.amount,
          base: src.base
        }
      })))
    }
  }

  savePeer(peer:DBPeer) {
    return this.peerDAL.savePeer(peer)
  }

  async getUniqueIssuersBetween(start:number, end:number) {
    const current = (await this.blockDAL.getCurrent()) as DBBlock
    const firstBlock = Math.max(0, start);
    const lastBlock = Math.max(0, Math.min(current.number, end));
    const blocks = await this.blockDAL.getBlocks(firstBlock, lastBlock);
    return Underscore.uniq(blocks.map(b => b.issuer))
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
      const savedConf = await this.confDAL.loadConf()
      const savedProxyConf = Underscore.extend(savedConf.proxyConf, {})
      conf = Underscore.extend(savedConf, overrideConf || {})
      if (overrideConf.proxiesConf !== undefined) {} else {
        conf.proxyConf = Underscore.extend(savedProxyConf, {})
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
    await Underscore.values(this.newDals).map((dal:Initiable) => dal.cleanCache && dal.cleanCache())
  }

  async close() {
    await Underscore.values(this.newDals).map((dal:Initiable) => dal.cleanCache && dal.cleanCache())
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

  async findReceiversAbove(minsig: number) {
    const receiversAbove:string[] = await this.cindexDAL.getReceiversAbove(minsig)
    const members:IdentityForRequirements[] = []
    for (const r of receiversAbove) {
      const i = await this.iindexDAL.getFullFromPubkey(r)
      members.push({
        hash: i.hash || "",
        member: i.member || false,
        wasMember: i.wasMember || false,
        pubkey: i.pub,
        uid: i.uid || "",
        buid: i.created_on || "",
        sig: i.sig || "",
        revocation_sig: "",
        revoked: false,
        revoked_on: 0
      })
    }
    return members
  }

  @MonitorFlushedIndex()
  async flushIndexes(indexes: IndexBatch) {
    await this.mindexDAL.insertBatch(indexes.mindex)
    await this.iindexDAL.insertBatch(indexes.iindex)
    await this.sindexDAL.insertBatch(indexes.sindex.filter(s => s.srcType === 'T')) // We don't store dividends in SINDEX
    await this.cindexDAL.insertBatch(indexes.cindex)
    await this.dividendDAL.consume(indexes.sindex.filter(s => s.srcType === 'D'))
  }

  async updateDividend(blockNumber: number, dividend: number|null, unitbase: number, local_iindex: IindexEntry[]): Promise<SimpleUdEntryForWallet[]> {
    if (dividend) {
      return this.dividendDAL.produceDividend(blockNumber, dividend, unitbase, local_iindex)
    }
    return []
  }
}
