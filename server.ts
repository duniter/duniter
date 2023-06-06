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

import {IdentityService} from "./app/service/IdentityService"
import {MembershipService} from "./app/service/MembershipService"
import {PeeringService} from "./app/service/PeeringService"
import {BlockchainService} from "./app/service/BlockchainService"
import {TransactionService} from "./app/service/TransactionsService"
import {ConfDTO} from "./app/lib/dto/ConfDTO"
import {FileDAL, FileDALParams} from "./app/lib/dal/fileDAL"
import * as stream from "stream"
import {Key, randomKey} from "./app/lib/common-libs/crypto/keyring"
import {parsers} from "./app/lib/common-libs/parsers/index"
import {Cloneable} from "./app/lib/dto/Cloneable"
import {CommonConstants, DuniterDocument, duniterDocument2str} from "./app/lib/common-libs/constants"
import {GlobalFifoPromise} from "./app/service/GlobalFifoPromise"
import {BlockchainContext} from "./app/lib/computation/BlockchainContext"
import {BlockDTO} from "./app/lib/dto/BlockDTO"
import {DBIdentity} from "./app/lib/dal/sqliteDAL/IdentityDAL"
import {CertificationDTO} from "./app/lib/dto/CertificationDTO"
import {MembershipDTO} from "./app/lib/dto/MembershipDTO"
import {RevocationDTO} from "./app/lib/dto/RevocationDTO"
import {TransactionDTO} from "./app/lib/dto/TransactionDTO"
import {PeerDTO} from "./app/lib/dto/PeerDTO"
import {OtherConstants} from "./app/lib/other_constants"
import {WS2PCluster} from "./app/modules/ws2p/lib/WS2PCluster"
import {DBBlock} from "./app/lib/db/DBBlock"
import {ProxiesConf} from './app/lib/proxy';
import {Directory, FileSystem} from "./app/lib/system/directory"
import {DataErrors} from "./app/lib/common-libs/errors"
import {DBPeer} from "./app/lib/db/DBPeer"
import {Underscore} from "./app/lib/common-libs/underscore"
import {SQLiteDriver} from "./app/lib/dal/drivers/SQLiteDriver"
import {LevelUp} from "levelup";
import {BMAConstants} from "./app/modules/bma/lib/constants"
import {HttpMilestonePage} from "./app/modules/bma/lib/dtos"
import * as toJson from "./app/modules/bma/lib/tojson"

export interface HookableServer {
  generatorGetJoinData: (...args:any[]) => Promise<any>
  generatorComputeNewCerts: (...args:any[]) => Promise<any>
  generatorNewCertsToLinks: (...args:any[]) => Promise<any>
  onPluggedFSHook: (...args:any[]) => Promise<any>
  resetDataHook: (...args:any[]) => Promise<any>
  resetConfigHook: (...args:any[]) => Promise<any>
}

const path        = require('path');
const archiver    = require('archiver');
const fs          = require('fs');
const es          = require('event-stream');
const extract = require('extract-zip')
const daemonize   = require("daemonize2")
const constants   = require('./app/lib/constants');
const jsonpckg    = require('./package.json');
const logger      = require('./app/lib/logger').NewLogger('server');

export class Server extends stream.Duplex implements HookableServer {

  private paramsP:Promise<FileDALParams>
  private endpointsDefinitions:(()=>Promise<string>)[] = []
  private wrongEndpointsFilters:((endpoints:string[])=>Promise<string[]>)[] = []
  startService:()=>Promise<void>
  stopService:()=>Promise<void>
  ws2pCluster:WS2PCluster|undefined
  conf:ConfDTO
  dal:FileDAL

  home:string
  version:string
  logger:any
  rawer:any
  keyPair:any
  sign:any
  blockchain:any
  sqliteDBs: {[path: string]: SQLiteDriver} = {};
  levelDBs: {[path: string]: LevelUp} = {};

  MerkleService:(req:any, merkle:any, valueCoroutine:any) => any
  IdentityService:IdentityService
  MembershipService:MembershipService
  PeeringService:PeeringService
  BlockchainService:BlockchainService
  TransactionsService:TransactionService
  private documentFIFO:GlobalFifoPromise
  milestoneArray: DBBlock[] = []

  constructor(home:string, private memoryOnly:boolean, private overrideConf:any) {
    super({ objectMode: true })

    this.home = home;
    this.conf = ConfDTO.mock()
    this.version = jsonpckg.version.split("-")[0];
    this.logger = logger;

    this.paramsP = Directory.getHomeParams(memoryOnly, home)

    this.documentFIFO = new GlobalFifoPromise()

    this.MerkleService       = require("./app/lib/helpers/merkle").processForURL
    this.IdentityService     = new IdentityService(this.documentFIFO)
    this.MembershipService   = new MembershipService(this.documentFIFO)
    this.PeeringService      = new PeeringService(this, this.documentFIFO)
    this.BlockchainService   = new BlockchainService(this, this.documentFIFO)
    this.TransactionsService = new TransactionService(this.documentFIFO)
  }

  getDocumentsFIFO() {
    return this.documentFIFO
  }

  // Unused, but made mandatory by Duplex interface
  _read() {}

  async _write(obj:any, enc:any, writeDone:any) {
    try {
      if (!obj.documentType) {
        throw "Unknown document type"
      }
      switch (obj.documentType) {
        case "block": await this.writeBlock(obj); break;
        case "identity": await this.writeIdentity(obj); break;
        case "certification": await this.writeCertification(obj); break;
        case "membership": await this.writeMembership(obj); break;
        case "transaction": await this.writeTransaction(obj); break;
        case "peer": await this.writePeer(obj); break;
      }
      writeDone()
    } catch (e) {
      writeDone()
    }
  }

  /**
   * Facade method to control what is pushed to the stream (we don't want it to be closed)
   * @param obj An object to be pushed to the stream.
   */
  streamPush(obj:any) {
    if (obj) {
      this.push(obj);
    }
  }

  getBcContext(): BlockchainContext {
    return this.BlockchainService.getContext()
  }

  async plugFileSystem() {
    logger.debug('Plugging file system...');
    const params = await this.paramsP
    this.dal = new FileDAL(params,
        (dbName: string) => this.getSQLiteDB(dbName, params.home),
        (dbName: string) => this.getLevelDB(dbName, params.home))
    await this.onPluggedFSHook()
  }

  async getSQLiteDB(dbName: string, home: string) {
    // Check in cach (useful to avoid migration task to create a new driver on the same DB file)
    let driver: SQLiteDriver = this.sqliteDBs[dbName];
    if (!driver || driver.isClosed()) {
      driver = await Directory.getHomeDB(this.memoryOnly, dbName, home);
      if (!this.memoryOnly) this.sqliteDBs[dbName] = driver;
    }
    return driver;
  }

  async getLevelDB(dbName: string, home: string) {
    // Check in cach (useful to avoid migration task to create a new driver on the same DB file)
    let driver: LevelUp = this.levelDBs[dbName];
    if (!driver || driver.isClosed()) {
      driver = await Directory.getHomeLevelDB(this.memoryOnly, dbName, home);
      if (!this.memoryOnly) this.levelDBs[dbName] = driver;
    }
    return driver;
  }

  async unplugFileSystem() {
    logger.debug('Unplugging file system...');
    await this.dal.close()
  }

  async reloadConf() {
    await this.loadConf(false, true)
  }

  async loadConf(useDefaultConf:any = false, reuseExisting = false) {
    logger.debug('Loading conf...');
    const loaded = await this.dal.loadConf(this.overrideConf, useDefaultConf)
    if (!reuseExisting || !this.conf) {
      this.conf = loaded
    } else {
      Underscore.extend(this.conf, loaded) // Overwrite the current conf
    }
    // Default values
    this.conf.proxiesConf      = this.conf.proxiesConf === undefined ?       new ProxiesConf()                            : this.conf.proxiesConf
    this.conf.remoteipv6       = this.conf.remoteipv6 === undefined ?        this.conf.ipv6                               : this.conf.remoteipv6
    this.conf.remoteport       = this.conf.remoteport === undefined ?        this.conf.port                               : this.conf.remoteport
    this.conf.c                = this.conf.c === undefined ?                 constants.CONTRACT.DEFAULT.C                 : this.conf.c
    this.conf.dt               = this.conf.dt === undefined ?                constants.CONTRACT.DEFAULT.DT                : this.conf.dt
    this.conf.ud0              = this.conf.ud0 === undefined ?               constants.CONTRACT.DEFAULT.UD0               : this.conf.ud0
    this.conf.stepMax          = this.conf.stepMax === undefined ?           constants.CONTRACT.DEFAULT.STEPMAX           : this.conf.stepMax
    this.conf.sigPeriod        = this.conf.sigPeriod === undefined ?         constants.CONTRACT.DEFAULT.SIGPERIOD         : this.conf.sigPeriod
    this.conf.msPeriod         = this.conf.msPeriod === undefined ?          constants.CONTRACT.DEFAULT.MSPERIOD          : this.conf.msPeriod
    this.conf.sigStock         = this.conf.sigStock === undefined ?          constants.CONTRACT.DEFAULT.SIGSTOCK          : this.conf.sigStock
    this.conf.sigWindow        = this.conf.sigWindow === undefined ?         constants.CONTRACT.DEFAULT.SIGWINDOW         : this.conf.sigWindow
    this.conf.sigValidity      = this.conf.sigValidity === undefined ?       constants.CONTRACT.DEFAULT.SIGVALIDITY       : this.conf.sigValidity
    this.conf.msValidity       = this.conf.msValidity === undefined ?        constants.CONTRACT.DEFAULT.MSVALIDITY        : this.conf.msValidity
    this.conf.sigQty           = this.conf.sigQty === undefined ?            constants.CONTRACT.DEFAULT.SIGQTY            : this.conf.sigQty
    this.conf.idtyWindow       = this.conf.idtyWindow === undefined ?        constants.CONTRACT.DEFAULT.IDTYWINDOW        : this.conf.idtyWindow
    this.conf.msWindow         = this.conf.msWindow === undefined ?          constants.CONTRACT.DEFAULT.MSWINDOW          : this.conf.msWindow
    this.conf.xpercent         = this.conf.xpercent === undefined ?          constants.CONTRACT.DEFAULT.X_PERCENT         : this.conf.xpercent
    this.conf.percentRot       = this.conf.percentRot === undefined ?        constants.CONTRACT.DEFAULT.PERCENTROT        : this.conf.percentRot
    this.conf.powDelay         = this.conf.powDelay === undefined ?          constants.CONTRACT.DEFAULT.POWDELAY          : this.conf.powDelay
    this.conf.avgGenTime       = this.conf.avgGenTime === undefined ?        constants.CONTRACT.DEFAULT.AVGGENTIME        : this.conf.avgGenTime
    this.conf.dtDiffEval       = this.conf.dtDiffEval === undefined ?        constants.CONTRACT.DEFAULT.DTDIFFEVAL        : this.conf.dtDiffEval
    this.conf.medianTimeBlocks = this.conf.medianTimeBlocks === undefined ?  constants.CONTRACT.DEFAULT.MEDIANTIMEBLOCKS  : this.conf.medianTimeBlocks
    this.conf.rootoffset       = this.conf.rootoffset === undefined ?        0                                            : this.conf.rootoffset
    this.conf.forksize         = this.conf.forksize === undefined ?          constants.BRANCHES.DEFAULT_WINDOW_SIZE       : this.conf.forksize
    // 1.3.X: the msPeriod = msWindow
    this.conf.msPeriod         = this.conf.msPeriod === undefined ?          this.conf.msWindow                           : this.conf.msPeriod
    // Default keypair
    if (!this.conf.pair || !this.conf.pair.pub || !this.conf.pair.sec) {
      // Create a random key
      this.conf.pair = randomKey().json()
    }
    // Extract key pair
    this.keyPair = new Key(this.conf.pair.pub, this.conf.pair.sec);
    this.sign = (msg:string) => this.keyPair.sign(msg)
    // Update services
    this.IdentityService.setConfDAL(this.conf, this.dal)
    this.MembershipService.setConfDAL(this.conf, this.dal)
    this.PeeringService.setConfDAL(this.conf, this.dal, this.keyPair)
    this.BlockchainService.setConfDAL(this.conf, this.dal, this.keyPair)
    this.TransactionsService.setConfDAL(this.conf, this.dal)

    // Messages piping
    this.BlockchainService
      .pipe(es.mapSync((e:any) => {
        if (e.bcEvent === OtherConstants.BC_EVENT.HEAD_CHANGED || e.bcEvent === OtherConstants.BC_EVENT.SWITCHED) {
          this.emit('bcEvent', e)
        }
        this.streamPush(e)
        return e
      }))

    return this.conf;
  }

  async initWithDAL() {
    await this.plugFileSystem()
    await this.loadConf()
    await this.initDAL()
    return this;
  }

  async writeRawBlock(raw:string): Promise<BlockDTO> {
    const obj = parsers.parseBlock.syncWrite(raw)
    return await this.writeBlock(obj)
  }

  async writeBlock(obj:any, notify = true, noResolution = false) {
    const res = await this.BlockchainService.submitBlock(obj, noResolution)
    if (notify) {
      this.emitDocument(res, DuniterDocument.ENTITY_BLOCK)
    }
    return res
  }

  async writeRawIdentity(raw:string): Promise<DBIdentity> {
    const obj = parsers.parseIdentity.syncWrite(raw)
    return await this.writeIdentity(obj)
  }

  async writeIdentity(obj:any, notify = true): Promise<DBIdentity> {
    const res = await this.IdentityService.submitIdentity(obj)
    if (notify) {
      this.emitDocument(res, DuniterDocument.ENTITY_IDENTITY)
    }
    return res
  }

  async writeRawCertification(raw:string): Promise<CertificationDTO> {
    const obj = parsers.parseCertification.syncWrite(raw)
    return await this.writeCertification(obj)
  }

  async writeCertification(obj:any, notify = true) {
    const res = await this.IdentityService.submitCertification(obj)
    if (notify) {
      this.emitDocument(res, DuniterDocument.ENTITY_CERTIFICATION)
    }
    return res
  }

  async writeRawMembership(raw:string): Promise<MembershipDTO> {
    const obj = parsers.parseMembership.syncWrite(raw)
    return await this.writeMembership(obj)
  }

  async writeMembership(obj:any, notify = true) {
    const res = await this.MembershipService.submitMembership(obj)
    if (notify) {
      this.emitDocument(res, DuniterDocument.ENTITY_MEMBERSHIP)
    }
    return res
  }

  async writeRawRevocation(raw:string): Promise<RevocationDTO> {
    const obj = parsers.parseRevocation.syncWrite(raw)
    return await this.writeRevocation(obj)
  }

  async writeRevocation(obj:any, notify = true) {
    const res = await this.IdentityService.submitRevocation(obj)
    if (notify) {
      this.emitDocument(res, DuniterDocument.ENTITY_REVOCATION)
    }
    return res
  }

  async writeRawTransaction(raw:string): Promise<TransactionDTO> {
    const obj = parsers.parseTransaction.syncWrite(raw)
    return await this.writeTransaction(obj)
  }

  async writeTransaction(obj:any, notify = true) {
    const res = await this.TransactionsService.processTx(obj)
    if (notify) {
      this.emitDocument(res, DuniterDocument.ENTITY_TRANSACTION)
    }
    return res
  }

  async writeRawPeer(raw:string): Promise<PeerDTO> {
    const obj = parsers.parsePeer.syncWrite(raw)
    return await this.writePeer(obj)
  }

  async writePeer(obj:any, notify = true) {
    const res = await this.PeeringService.submitP(obj)
    if (notify) {
      this.emitDocument(res, DuniterDocument.ENTITY_PEER)
    }
    return res
  }

  private async emitDocument(res:Cloneable, type:DuniterDocument) {
    this.emit(duniterDocument2str(type), res.clone())
    this.streamPush(res.clone())
  }

  async initDAL(conf:ConfDTO|null = null) {
    await this.dal.init(this.conf)
    // Maintenance
    let head_1 = await this.dal.bindexDAL.head(1);
    if (head_1) {
      // Case 1: b_index < block
      await this.dal.blockDAL.dropNonForkBlocksAbove(head_1.number)
      // Case 2: b_index > block
      const current = await this.dal.blockDAL.getCurrent();
      const nbBlocksToRevert = (head_1.number - (current as DBBlock).number);
      for (let i = 0; i < nbBlocksToRevert; i++) {
        await this.revertHead();
      }
    }
    // Eventual block resolution
    await this.BlockchainService.blockResolution()
    // Eventual fork resolution
    await this.BlockchainService.forkResolution()
  }

  recomputeSelfPeer(): Promise<DBPeer | null> {
    return this.PeeringService.generateSelfPeer(this.conf)
  }

  getCountOfSelfMadePoW() {
    return this.BlockchainService.getCountOfSelfMadePoW()
  }
  
  checkConfig(): Promise<any> {
    if (!this.conf.pair) {
      throw new Error('No keypair was given.');
    }
    return Promise.resolve()
  }

  async resetHome() {
    const params = await this.paramsP;
    const myFS = params.fs;
    const rootPath = params.home;
    const existsDir = await myFS.fsExists(rootPath);
    if (existsDir) {
      await myFS.fsRemoveTree(rootPath);
    }
  }

  async resetAll(done:any = null) {
    await this.resetDataHook()
    await this.resetConfigHook()
    const files = ['stats', 'cores', 'current', Directory.DUNITER_DB_NAME, Directory.DUNITER_DB_NAME + '.db', Directory.DUNITER_DB_NAME + '.log', Directory.OLD_WOTB_FILE, 'export.zip', 'import.zip', 'conf']
      .concat(Directory.DATA_FILES)
      .concat(Directory.WW_FILES)
    const dirs  = ['archives', 'loki', 'blocks', 'blockchain', 'ud_history', 'branches', 'certs', 'txs', 'cores', 'sources', 'links', 'ms', 'identities', 'peers', 'indicators', 'leveldb']
      .concat(Directory.DATA_DIRS)
    return this.resetFiles(files, dirs, done);
  }

  async resetData(done:any = null) {
    await this.resetDataHook()
    const files = ['stats', 'cores', 'current', Directory.DUNITER_DB_NAME, Directory.DUNITER_DB_NAME + '.db', Directory.DUNITER_DB_NAME + '.log', Directory.OLD_WOTB_FILE]
      .concat(Directory.DATA_FILES)
      .concat(Directory.WW_FILES)
    const dirs  = ['archives', 'loki', 'blocks', 'ud_history', 'branches', 'certs', 'txs', 'cores', 'sources', 'links', 'ms', 'identities', 'peers', 'indicators', 'leveldb']
      .concat(Directory.DATA_DIRS)
    await this.resetFiles(files, dirs, done);
  }

  async resetConf(done:any = null) {
    await this.resetConfigHook()
    const files = ['conf'];
    const dirs:string[]  = [];
    return this.resetFiles(files, dirs, done);
  }

  resetStats(done:any = null) {
    const files = ['stats'];
    const dirs  = ['ud_history'];
    return this.resetFiles(files, dirs, done);
  }

  resetPeers() {
    return this.dal.resetPeers()
  }

  async exportAllDataAsZIP() {
    const params = await this.paramsP
    const rootPath = params.home;
    const myFS = params.fs;
    const archive = archiver('zip');
    if (await myFS.fsExists(path.join(rootPath, 'indicators'))) {
      archive.directory(path.join(rootPath, 'indicators'), '/indicators', undefined, { name: 'indicators'});
    }
    const files = ['duniter.db', 'stats.json', 'wotb.bin'];
    for (const file of files) {
      if (await myFS.fsExists(path.join(rootPath, file))) {
        archive.file(path.join(rootPath, file), { name: file });
      }
    }
    archive.finalize();
    return archive;
  }

  async importAllDataFromZIP(zipFile:string) {
    const params = await this.paramsP
    await this.resetData()

    extract(zipFile, { dir: params.home })
  }

  private async resetFiles(files:string[], dirs:string[], done:any = null) {
    try {
      const params = await this.paramsP;
      const myFS:FileSystem = params.fs;
      const rootPath = params.home;
      for (const fName of files) {
        // JSON file?
        const existsJSON = await myFS.fsExists(rootPath + '/' + fName + '.json');
        if (existsJSON) {
          const theFilePath = rootPath + '/' + fName + '.json';
          await myFS.fsUnlink(theFilePath);
          if (await myFS.fsExists(theFilePath)) {
            throw Error('Failed to delete file "' + theFilePath + '"');
          }
        } else {
          // Normal file?
          const normalFile = path.join(rootPath, fName);
          const existsFile = await myFS.fsExists(normalFile);
          if (existsFile) {
            await myFS.fsUnlink(normalFile);
            if (await myFS.fsExists(normalFile)) {
              throw Error('Failed to delete file "' + normalFile + '"');
            }
          }
        }
      }
      for (const dirName of dirs) {
        const existsDir = await myFS.fsExists(rootPath + '/' + dirName);
        if (existsDir) {
          await myFS.fsRemoveTree(rootPath + '/' + dirName);
          if (await myFS.fsExists(rootPath + '/' + dirName)) {
            throw Error('Failed to delete folder "' + rootPath + '/' + dirName + '"');
          }
        }
      }
      done && done();
    } catch(e) {
      done && done(e);
      throw e;
    }
  }

  async disconnect() {
    await this.documentFIFO.closeFIFO()
    if (this.dal) {
      await this.dal.close()
    }
    await Promise.all(Object.values(this.sqliteDBs)
        .filter(db => db && !db.isClosed())
        .map(db => db.closeConnection()));
    await Promise.all(Object.values(this.levelDBs)
        .filter(db => db && !db.isClosed())
        .map(db => db.close()));
  }

  revert() {
    return this.BlockchainService.revertCurrentBlock()
  }

  revertHead() {
    return this.BlockchainService.revertCurrentHead()
  }

  async revertTo(number:number) {
    const current = await this.BlockchainService.current();
    if (!current) {
      throw Error(DataErrors[DataErrors.CANNOT_REVERT_NO_CURRENT_BLOCK])
    }
    for (let i = 0, count = current.number - number; i < count; i++) {
      await this.BlockchainService.revertCurrentBlock()
    }
    if (current.number <= number) {
      logger.warn('Already reached');
    }
  }

  pullingEvent(type:string, number:any = null) {
    this.push({
      pulling: {
        type: type,
        data: number
      }
    })
    if (type !== 'end') {
      this.push({ pulling: 'processing' })
    } else {
      this.push({ pulling: 'finished' })
    }
  }

  async reapplyTo(number:number) {
    const current = await this.BlockchainService.current();
    if (!current) {
      throw Error(DataErrors[DataErrors.CANNOT_REAPPLY_NO_CURRENT_BLOCK])
    }
    if (current.number == number) {
      logger.warn('Already reached');
    } else {
      for (let i = 0, count = number - current.number; i < count; i++) {
        await this.BlockchainService.applyNextAvailableFork();
      }
    }
  }

  /*****************
   * DAEMONIZATION
   ****************/

  /**
   * Get the daemon handle. Eventually give arguments to launch a new daemon.
   * @param overrideCommand The new command to launch.
   * @param insteadOfCmd The current command to be replaced by `overrideCommand` command.
   * @returns {*} The daemon handle.
   */
  getDaemon(overrideCommand:string = "", insteadOfCmd:string = "") {
    const mainModule = process.argv[1]
    const cwd = path.resolve(mainModule, '../..')
    const argv = this.getCommand(overrideCommand, insteadOfCmd)
    return daemonize.setup({
      main: mainModule,
      name: Directory.INSTANCE_NAME,
      pidfile: path.join(Directory.INSTANCE_HOME, "app.pid"),
      argv,
      cwd
    });
  }

  /**
   * Return current script full command arguments except the two firsts (which are node executable + js file).
   * If the two optional `cmd` and `insteadOfCmd` parameters are given, replace `insteadOfCmd`'s value by `cmd` in
   * the script arguments.
   *
   *   Ex:
   *     * process.argv: ['/usr/bin/node', '/opt/duniter/sources/bin/duniter', 'restart', '--mdb', 'g1']
   *
   *     Then `getCommand('direct_start', 'restart') will return:
   *
   *     * ['direct_start', '--mdb', 'g1']
   *
   *     This new array is what will be given to a *fork* of current script, resulting in a new process with:
   *
   *     * process.argv: ['/usr/bin/node', '/opt/duniter/sources/bin/duniter', 'direct_start', '--mdb', 'g1']
   *
   * @param cmd
   * @param insteadOfCmd
   * @returns {*}
   */
  private getCommand(cmd:string = "", insteadOfCmd:string = "") {
    if (insteadOfCmd) {
      // Return the same command args, except the command `insteadOfCmd` which is replaced by `cmd`
      return process.argv.slice(2).map((arg) => {
        if (arg == insteadOfCmd) {
          return cmd
        } else {
          return arg
        }
      })
    } else {
      // Return the exact same args (generally for stop/status commands)
      return process.argv.slice(2)
    }
  }

  /**
   * Retrieve the last linesQuantity lines from the log file.
   * @param linesQuantity
   */
  getLastLogLines(linesQuantity:number) {
    return this.dal.getLogContent(linesQuantity)
  }

  addEndpointsDefinitions(definition:()=>Promise<string>) {
    this.endpointsDefinitions.push(definition)
  }

  addWrongEndpointFilter(filter:(endpoints:string[])=>Promise<string[]>) {
    this.wrongEndpointsFilters.push(filter)
  }

  async getEndpoints() {
    const endpoints = await Promise.all(this.endpointsDefinitions.map(d => d()))
    return endpoints.filter(ep => !!ep)
  }

  async getWrongEndpoints(endpoints:string[]) {
    let wrongs:string[] = []
    for (const filter of this.wrongEndpointsFilters) {
      const newWrongs = await filter(endpoints)
      wrongs = wrongs.concat(newWrongs)
    }
    return wrongs
  }

  /*****************
   * MODULES UTILITIES
   ****************/

  requireFile(path:string) {
    return require('./' + path)
  }

  /*****************
   * MODULES PLUGS
   ****************/

  /**
   * Default WoT incoming data for new block. To be overriden by a module.
   */
  generatorGetJoinData(current:DBBlock|null, idtyHash:string , char:string): Promise<any> {
    return Promise.resolve({})
  }

  /**
   * Default WoT incoming certifications for new block, filtering wrong certs. To be overriden by a module.
   */
  generatorComputeNewCerts(...args:any[]): Promise<any> {
    return Promise.resolve({})
  }

  /**
   * Default WoT transforming method for certs => links. To be overriden by a module.
   */
  generatorNewCertsToLinks(...args:any[]): Promise<any> {
    return Promise.resolve({})
  }

  /**
   * Default hook on file system plugging. To be overriden by module system.
   */
  onPluggedFSHook(): Promise<any> {
    return Promise.resolve({})
  }

  /**
   * Default hook on data reset. To be overriden by module system.
   */
  resetDataHook(): Promise<any> {
    return Promise.resolve({})
  }

  /**
   * Default hook on data reset. To be overriden by module system.
   */
  resetConfigHook(): Promise<any> {
    return Promise.resolve({})
  }

  async milestones(page?: number): Promise<HttpMilestonePage> {
    const chunkSize = CommonConstants.SYNC_BLOCKS_CHUNK
    const milestonesPerPage = CommonConstants.MILESTONES_PER_PAGE
    const current = await this.dal.getCurrentBlockOrNull();
    if (!current) {
      return {
        totalPages: 0,
        chunkSize,
        milestonesPerPage
      }
    }
    const topNumber = current.number - this.conf.forksize
    const nbMilestones = (topNumber - (topNumber % chunkSize)) / chunkSize
    const totalPages = (nbMilestones - (nbMilestones % milestonesPerPage)) / milestonesPerPage
    if (page === undefined) {
      return {
        totalPages,
        chunkSize,
        milestonesPerPage
      }
    }
    if (page > totalPages || page <= 0) throw BMAConstants.ERRORS.INCORRECT_PAGE_NUMBER
    while (this.milestoneArray.length < page * milestonesPerPage) {
      const lastMilestoneNumber = this.milestoneArray.length
      // Feed the milestones
      const newMilestones: DBBlock[] = []
      for (let i = 1; i <= milestonesPerPage && this.milestoneArray.length < page * milestonesPerPage; i++) {
        const b = await this.dal.getBlock((lastMilestoneNumber + i) * chunkSize - 1)
        if (!b) {
          throw Error(DataErrors[DataErrors.MILESTONE_BLOCK_NOT_FOUND])
        }
        newMilestones.push(b)
      }
      // As the process is async, another call to "milestones()" maybe have already filled in the milestones
      if (this.milestoneArray.length < page * milestonesPerPage) {
        this.milestoneArray = this.milestoneArray.concat(newMilestones)
      }
    }
    const blocks = this.milestoneArray.slice((page - 1) * milestonesPerPage, page * milestonesPerPage)
    return {
      totalPages,
      chunkSize,
      milestonesPerPage,
      currentPage: page,
      blocks: blocks.map(b => toJson.block(b))
    }
  }
}
