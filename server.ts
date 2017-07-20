import {IdentityService} from "./app/service/IdentityService"
import {MembershipService} from "./app/service/MembershipService"
import {PeeringService} from "./app/service/PeeringService"
import {BlockchainService} from "./app/service/BlockchainService"
import {TransactionService} from "./app/service/TransactionsService"
import {ConfDTO} from "./app/lib/dto/ConfDTO"
import {FileDAL} from "./app/lib/dal/fileDAL"
import {DuniterBlockchain} from "./app/lib/blockchain/DuniterBlockchain"
import {SQLBlockchain} from "./app/lib/blockchain/SqlBlockchain"
import * as stream from "stream"
import {KeyGen, randomKey} from "./app/lib/common/crypto/keyring"

interface HookableServer {
  getMainEndpoint: (...args:any[]) => Promise<any>
  generatorGetJoinData: (...args:any[]) => Promise<any>
  generatorComputeNewCerts: (...args:any[]) => Promise<any>
  generatorNewCertsToLinks: (...args:any[]) => Promise<any>
  onPluggedFSHook: (...args:any[]) => Promise<any>
  resetDataHook: (...args:any[]) => Promise<any>
  resetConfigHook: (...args:any[]) => Promise<any>
}

const path        = require('path');
const _           = require('underscore');
const archiver    = require('archiver');
const unzip       = require('unzip2');
const fs          = require('fs');
const daemonize   = require("daemonize2")
const parsers     = require('duniter-common').parsers;
const constants   = require('./app/lib/constants');
const jsonpckg    = require('./package.json');
const directory   = require('./app/lib/system/directory');
const rawer       = require('duniter-common').rawer;
const logger      = require('./app/lib/logger').NewLogger('server');

export class Server extends stream.Duplex implements HookableServer {

  private paramsP:Promise<any>|null
  conf:ConfDTO
  dal:FileDAL

  documentsMapping:any
  home:string
  version:number
  logger:any
  rawer:any
  keyPair:any
  sign:any
  blockchain:any

  MerkleService:(req:any, merkle:any, valueCoroutine:any) => any
  IdentityService:IdentityService
  MembershipService:MembershipService
  PeeringService:PeeringService
  BlockchainService:BlockchainService
  TransactionsService:TransactionService

  constructor(home:string, memoryOnly:boolean, private overrideConf:any) {
    super({ objectMode: true })

    this.home = home;
    this.conf = ConfDTO.mock()
    this.version = jsonpckg.version;
    this.logger = logger;
    this.rawer = rawer;

    this.paramsP = directory.getHomeParams(memoryOnly, home)

    this.MerkleService       = require("./app/lib/helpers/merkle");
    this.IdentityService     = new IdentityService()
    this.MembershipService   = new MembershipService()
    this.PeeringService      = new PeeringService(this)
    this.BlockchainService   = new BlockchainService(this)
    this.TransactionsService = new TransactionService()

    // Create document mapping
    this.documentsMapping = {
      'identity':      { action: (obj:any) => this.IdentityService.submitIdentity(obj),                                 parser: parsers.parseIdentity },
      'certification': { action: (obj:any) => this.IdentityService.submitCertification(obj),                            parser: parsers.parseCertification},
      'revocation':    { action: (obj:any) => this.IdentityService.submitRevocation(obj),                               parser: parsers.parseRevocation },
      'membership':    { action: (obj:any) => this.MembershipService.submitMembership(obj),                             parser: parsers.parseMembership },
      'peer':          { action: (obj:any) => this.PeeringService.submitP(obj),                                         parser: parsers.parsePeer },
      'transaction':   { action: (obj:any) => this.TransactionsService.processTx(obj),                                  parser: parsers.parseTransaction },
      'block':         { action: (obj:any) => this.BlockchainService.submitBlock(obj, true, constants.NO_FORK_ALLOWED), parser: parsers.parseBlock }
    }
  }

  // Unused, but made mandatory by Duplex interface
  _read() {}

  _write(obj:any, enc:any, writeDone:any) {
    return this.submit(obj, false, () => writeDone)
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

  getBcContext() {
    return this.BlockchainService.getContext()
  }

  async plugFileSystem() {
    logger.debug('Plugging file system...');
    const params = await this.paramsP
    this.dal = new FileDAL(params)
    await this.onPluggedFSHook()
  }

  async unplugFileSystem() {
    logger.debug('Unplugging file system...');
    await this.dal.close()
  }

  async loadConf(useDefaultConf:any = false) {
    logger.debug('Loading conf...');
    this.conf = await this.dal.loadConf(this.overrideConf, useDefaultConf)
    // Default values
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
    this.keyPair = KeyGen(this.conf.pair.pub, this.conf.pair.sec);
    this.sign = (msg:string) => this.keyPair.sign(msg)
    // Blockchain object
    this.blockchain = new DuniterBlockchain(new SQLBlockchain(this.dal), this.dal);
    // Update services
    this.IdentityService.setConfDAL(this.conf, this.dal)
    this.MembershipService.setConfDAL(this.conf, this.dal)
    this.PeeringService.setConfDAL(this.conf, this.dal, this.keyPair)
    this.BlockchainService.setConfDAL(this.conf, this.dal, this.keyPair)
    this.TransactionsService.setConfDAL(this.conf, this.dal)
    return this.conf;
  }

  async initWithDAL() {
    await this.plugFileSystem()
    await this.loadConf()
    await this.initDAL()
    return this;
  }

  async submit(obj:any, isInnerWrite:boolean = false, done:any|null = null) {
    if (!obj.documentType) {
      throw 'Document type not given';
    }
    try {
      const action = this.documentsMapping[obj.documentType].action;
      let res;
      if (typeof action == 'function') {
        // Handle the incoming object
        res = await action(obj)
      } else {
        throw 'Unknown document type \'' + obj.documentType + '\'';
      }
      if (res) {
        // Only emit valid documents
        this.emit(obj.documentType, _.clone(res));
        this.streamPush(_.clone(res));
      }
      if (done) {
        isInnerWrite ? done(null, res) : done();
      }
      return res;
    } catch (err) {
      if (err && !err.uerr) {
        // Unhandled error, display it
        logger.debug('Document write error: ', err);
      }
      if (done) {
        isInnerWrite ? done(err, null) : done();
      } else {
        throw err;
      }
    }
  }

  submitP(obj:any, isInnerWrite:boolean) {
    return this.submit(obj, isInnerWrite)
  }

  async initDAL(conf:ConfDTO|null = null) {
    await this.dal.init(this.conf)
    // Maintenance
    let head_1 = await this.dal.bindexDAL.head(1);
    if (head_1) {
      // Case 1: b_index < block
      await this.dal.blockDAL.exec('DELETE FROM block WHERE NOT fork AND number > ' + head_1.number);
      // Case 2: b_index > block
      const current = await this.dal.blockDAL.getCurrent();
      const nbBlocksToRevert = (head_1.number - current.number);
      for (let i = 0; i < nbBlocksToRevert; i++) {
        await this.revert();
      }
    }
  }

  recomputeSelfPeer() {
    return this.PeeringService.generateSelfPeer(this.conf, 0)
  }

  getCountOfSelfMadePoW() {
    return this.BlockchainService.getCountOfSelfMadePoW()
  }
  
  isServerMember() {
    return this.BlockchainService.isMember()
  }

  checkConfig() {
    if (!this.conf.pair) {
      throw new Error('No keypair was given.');
    }
  }

  async resetHome() {
    const params = await this.paramsP;
    const myFS = params.fs;
    const rootPath = params.home;
    const existsDir = await myFS.exists(rootPath);
    if (existsDir) {
      await myFS.removeTree(rootPath);
    }
  }

  async resetAll(done:any) {
    await this.resetDataHook()
    await this.resetConfigHook()
    const files = ['stats', 'cores', 'current', directory.DUNITER_DB_NAME, directory.DUNITER_DB_NAME + '.db', directory.DUNITER_DB_NAME + '.log', directory.WOTB_FILE, 'export.zip', 'import.zip', 'conf'];
    const dirs  = ['blocks', 'blockchain', 'ud_history', 'branches', 'certs', 'txs', 'cores', 'sources', 'links', 'ms', 'identities', 'peers', 'indicators', 'leveldb'];
    return this.resetFiles(files, dirs, done);
  }

  async resetData(done:any = null) {
    await this.resetDataHook()
    const files = ['stats', 'cores', 'current', directory.DUNITER_DB_NAME, directory.DUNITER_DB_NAME + '.db', directory.DUNITER_DB_NAME + '.log', directory.WOTB_FILE];
    const dirs  = ['blocks', 'ud_history', 'branches', 'certs', 'txs', 'cores', 'sources', 'links', 'ms', 'identities', 'peers', 'indicators', 'leveldb'];
    await this.resetFiles(files, dirs, done);
  }

  async resetConf(done:any) {
    await this.resetConfigHook()
    const files = ['conf'];
    const dirs:string[]  = [];
    return this.resetFiles(files, dirs, done);
  }

  resetStats(done:any) {
    const files = ['stats'];
    const dirs  = ['ud_history'];
    return this.resetFiles(files, dirs, done);
  }

  resetPeers(done:any) {
    return this.dal.resetPeers()
  }

  async exportAllDataAsZIP() {
    const params = await this.paramsP
    const rootPath = params.home;
    const myFS = params.fs;
    const archive = archiver('zip');
    if (await myFS.exists(path.join(rootPath, 'indicators'))) {
      archive.directory(path.join(rootPath, 'indicators'), '/indicators', undefined, { name: 'indicators'});
    }
    const files = ['duniter.db', 'stats.json', 'wotb.bin'];
    for (const file of files) {
      if (await myFS.exists(path.join(rootPath, file))) {
        archive.file(path.join(rootPath, file), { name: file });
      }
    }
    archive.finalize();
    return archive;
  }

  async importAllDataFromZIP(zipFile:string) {
    const params = await this.paramsP
    await this.resetData()
    const output = unzip.Extract({ path: params.home });
    fs.createReadStream(zipFile).pipe(output);
    return new Promise((resolve, reject) => {
      output.on('error', reject);
      output.on('close', resolve);
    })
  }

  async cleanDBData() {
    await this.dal.cleanCaches();
    this.dal.wotb.resetWoT();
    const files = ['stats', 'cores', 'current', directory.DUNITER_DB_NAME, directory.DUNITER_DB_NAME + '.db', directory.DUNITER_DB_NAME + '.log'];
    const dirs  = ['blocks', 'ud_history', 'branches', 'certs', 'txs', 'cores', 'sources', 'links', 'ms', 'identities', 'peers', 'indicators', 'leveldb'];
    return this.resetFiles(files, dirs);
  }

  private async resetFiles(files:string[], dirs:string[], done:any = null) {
    try {
      const params = await this.paramsP;
      const myFS = params.fs;
      const rootPath = params.home;
      for (const fName of files) {
        // JSON file?
        const existsJSON = await myFS.exists(rootPath + '/' + fName + '.json');
        if (existsJSON) {
          const theFilePath = rootPath + '/' + fName + '.json';
          await myFS.remove(theFilePath);
          if (await myFS.exists(theFilePath)) {
            throw Error('Failed to delete file "' + theFilePath + '"');
          }
        } else {
          // Normal file?
          const normalFile = path.join(rootPath, fName);
          const existsFile = await myFS.exists(normalFile);
          if (existsFile) {
            await myFS.remove(normalFile);
            if (await myFS.exists(normalFile)) {
              throw Error('Failed to delete file "' + normalFile + '"');
            }
          }
        }
      }
      for (const dirName of dirs) {
        const existsDir = await myFS.exists(rootPath + '/' + dirName);
        if (existsDir) {
          await myFS.removeTree(rootPath + '/' + dirName);
          if (await myFS.exists(rootPath + '/' + dirName)) {
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

  disconnect() {
    return Promise.resolve(this.dal && this.dal.close())
  }

  revert() {
    return this.BlockchainService.revertCurrentBlock()
  }

  async revertTo(number:number) {
    const current = await this.BlockchainService.current();
    for (let i = 0, count = current.number - number; i < count; i++) {
      await this.BlockchainService.revertCurrentBlock()
    }
    if (current.number <= number) {
      logger.warn('Already reached');
    }
  }

  async reapplyTo(number:number) {
    const current = await this.BlockchainService.current();
    if (current.number == number) {
      logger.warn('Already reached');
    } else {
      for (let i = 0, count = number - current.number; i < count; i++) {
        await this.BlockchainService.applyNextAvailableFork();
      }
    }
  }

  singleWritePromise(obj:any) {
    return this.submit(obj)
  }

  async writeRaw(raw:string, type:string) {
    const parser = this.documentsMapping[type] && this.documentsMapping[type].parser;
    const obj = parser.syncWrite(raw, logger);
    return await this.singleWritePromise(obj);
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
      name: directory.INSTANCE_NAME,
      pidfile: path.join(directory.INSTANCE_HOME, "app.pid"),
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

  /*****************
   * MODULES PLUGS
   ****************/

  /**
   * Default endpoint. To be overriden by a module to specify another endpoint value (for ex. BMA).
   */
  getMainEndpoint(): Promise<any> {
    return Promise.resolve('DEFAULT_ENDPOINT')
  }

  /**
   * Default WoT incoming data for new block. To be overriden by a module.
   */
  generatorGetJoinData(): Promise<any> {
    return Promise.resolve({})
  }

  /**
   * Default WoT incoming certifications for new block, filtering wrong certs. To be overriden by a module.
   */
  generatorComputeNewCerts(): Promise<any> {
    return Promise.resolve({})
  }

  /**
   * Default WoT transforming method for certs => links. To be overriden by a module.
   */
  generatorNewCertsToLinks(): Promise<any> {
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
}