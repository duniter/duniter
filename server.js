"use strict";
const stream      = require('stream');
const util        = require('util');
const path        = require('path');
const co          = require('co');
const _           = require('underscore');
const Q           = require('q');
const archiver    = require('archiver');
const unzip       = require('unzip2');
const fs          = require('fs');
const parsers     = require('./app/lib/streams/parsers');
const constants   = require('./app/lib/constants');
const fileDAL     = require('./app/lib/dal/fileDAL');
const jsonpckg    = require('./package.json');
const router      = require('./app/lib/streams/router');
const base58      = require('./app/lib/crypto/base58');
const keyring      = require('./app/lib/crypto/keyring');
const directory   = require('./app/lib/system/directory');
const dos2unix    = require('./app/lib/system/dos2unix');
const Synchroniser = require('./app/lib/sync');
const multicaster = require('./app/lib/streams/multicaster');
const upnp        = require('./app/lib/system/upnp');
const rawer       = require('./app/lib/ucp/rawer');
const permanentProver = require('./app/lib/computation/permanentProver');

function Server (dbConf, overrideConf) {

  stream.Duplex.call(this, { objectMode: true });

  const home = directory.getHome(dbConf.name, dbConf.home);
  const paramsP = directory.getHomeParams(dbConf && dbConf.memory, home);
  const logger = require('./app/lib/logger')('server');
  const permaProver = this.permaProver = permanentProver(this);
  const that = this;
  that.home = home;
  that.conf = null;
  that.dal = null;
  that.version = jsonpckg.version;
  that.logger = logger;

  // External libs
  that.lib = {};
  that.lib.keyring = require('./app/lib/crypto/keyring');
  that.lib.Identity = require('./app/lib/entity/identity');
  that.lib.rawer = require('./app/lib/ucp/rawer');
  that.lib.http2raw = require('./app/lib/helpers/http2raw');
  that.lib.dos2unix = require('./app/lib/system/dos2unix');
  that.lib.contacter = require('./app/lib/contacter');
  that.lib.bma = require('./app/lib/streams/bma');
  that.lib.network = require('./app/lib/system/network');
  that.lib.constants = require('./app/lib/constants');
  that.lib.ucp = require('./app/lib/ucp/buid');

  that.MerkleService       = require("./app/lib/helpers/merkle");
  that.ParametersService   = require("./app/lib/helpers/parameters")();
  that.IdentityService     = require('./app/service/IdentityService')();
  that.MembershipService   = require('./app/service/MembershipService')();
  that.PeeringService      = require('./app/service/PeeringService')(that);
  that.BlockchainService   = require('./app/service/BlockchainService')(that);
  that.TransactionsService = require('./app/service/TransactionsService')();

  // Create document mapping
  const documentsMapping = {
    'identity':      { action: that.IdentityService.submitIdentity,                                               parser: parsers.parseIdentity },
    'certification': { action: that.IdentityService.submitCertification,                                          parser: parsers.parseCertification},
    'revocation':    { action: that.IdentityService.submitRevocation,                                             parser: parsers.parseRevocation },
    'membership':    { action: that.MembershipService.submitMembership,                                           parser: parsers.parseMembership },
    'peer':          { action: that.PeeringService.submitP,                                                       parser: parsers.parsePeer },
    'transaction':   { action: that.TransactionsService.processTx,                                                parser: parsers.parseTransaction },
    'block':         { action: _.partial(that.BlockchainService.submitBlock, _, true, constants.NO_FORK_ALLOWED), parser: parsers.parseBlock }
  };

  // Unused, but made mandatory by Duplex interface
  this._read = () => null;

  this._write = (obj, enc, writeDone) => that.submit(obj, false, () => writeDone);

  /**
   * Facade method to control what is pushed to the stream (we don't want it to be closed)
   * @param obj An object to be pushed to the stream.
   */
  this.streamPush = (obj) => {
    if (obj) {
      that.push(obj);
    }
  };

  this.getBcContext = () => this.BlockchainService.getContext();

  this.plugFileSystem = () => co(function *() {
    logger.debug('Plugging file system...');
    const params = yield paramsP;
    that.dal = fileDAL(params);
  });

  this.unplugFileSystem = () => co(function *() {
    logger.debug('Unplugging file system...');
    yield that.dal.close();
  });

  this.loadConf = (useDefaultConf) => co(function *() {
    logger.debug('Loading conf...');
    that.conf = yield that.dal.loadConf(overrideConf, useDefaultConf);
    // Default values
    const defaultValues = {
      remoteipv6:         that.conf.ipv6,
      remoteport:         that.conf.port,
      cpu:                constants.DEFAULT_CPU,
      c:                  constants.CONTRACT.DEFAULT.C,
      dt:                 constants.CONTRACT.DEFAULT.DT,
      ud0:                constants.CONTRACT.DEFAULT.UD0,
      stepMax:            constants.CONTRACT.DEFAULT.STEPMAX,
      sigPeriod:          constants.CONTRACT.DEFAULT.SIGPERIOD,
      sigStock:           constants.CONTRACT.DEFAULT.SIGSTOCK,
      sigWindow:          constants.CONTRACT.DEFAULT.SIGWINDOW,
      sigValidity:        constants.CONTRACT.DEFAULT.SIGVALIDITY,
      msValidity:         constants.CONTRACT.DEFAULT.MSVALIDITY,
      sigQty:             constants.CONTRACT.DEFAULT.SIGQTY,
      idtyWindow:         constants.CONTRACT.DEFAULT.IDTYWINDOW,
      msWindow:           constants.CONTRACT.DEFAULT.MSWINDOW,
      xpercent:           constants.CONTRACT.DEFAULT.X_PERCENT,
      percentRot:         constants.CONTRACT.DEFAULT.PERCENTROT,
      blocksRot:          constants.CONTRACT.DEFAULT.BLOCKSROT,
      powDelay:           constants.CONTRACT.DEFAULT.POWDELAY,
      avgGenTime:         constants.CONTRACT.DEFAULT.AVGGENTIME,
      dtDiffEval:         constants.CONTRACT.DEFAULT.DTDIFFEVAL,
      medianTimeBlocks:   constants.CONTRACT.DEFAULT.MEDIANTIMEBLOCKS,
      rootoffset:         0,
      forksize:           constants.BRANCHES.DEFAULT_WINDOW_SIZE
    };
    _.keys(defaultValues).forEach(function(key){
      if (that.conf[key] == undefined) {
        that.conf[key] = defaultValues[key];
      }
    });
    logger.debug('Loading crypto functions...');
    // Extract key pair
    let keyPair = null;
    const keypairOverriden = overrideConf && (overrideConf.salt || overrideConf.passwd);
    if (!keypairOverriden && that.conf.pair) {
      keyPair = keyring.Key(that.conf.pair.pub, that.conf.pair.sec);
    }
    else if (that.conf.passwd || that.conf.salt) {
      keyPair = yield keyring.scryptKeyPair(that.conf.salt, that.conf.passwd);
    }
    if (keyPair) {
      that.keyPair = keyPair;
      that.sign = keyPair.sign;
      // Update services
      [that.IdentityService, that.MembershipService, that.PeeringService, that.BlockchainService, that.TransactionsService].map((service) => {
        service.setConfDAL(that.conf, that.dal, that.keyPair);
      });
      that.router().setConfDAL(that.conf, that.dal);
    }
    return that.conf;
  });

  this.initWithDAL = () => co(function *() {
    yield that.plugFileSystem();
    yield that.loadConf();
    yield that.initDAL();
    return that;
  });

  this.submit = (obj, isInnerWrite, done) => {
    return co(function *() {
      if (!obj.documentType) {
        throw 'Document type not given';
      }
      try {
        const action = documentsMapping[obj.documentType].action;
        let res;
        if (typeof action == 'function') {
          // Handle the incoming object
          res = yield action(obj);
        } else {
          throw 'Unknown document type \'' + obj.documentType + '\'';
        }
        if (res) {
          // Only emit valid documents
          that.emit(obj.documentType, _.clone(res));
          that.streamPush(_.clone(res));
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
    });
  };

  this.submitP = (obj, isInnerWrite) => Q.nbind(this.submit, this)(obj, isInnerWrite);

  this.initDAL = () => this.dal.init();

  this.start = () => co(function*(){
    yield that.checkConfig();
    // Add signing & public key functions to PeeringService
    logger.info('Node version: ' + that.version);
    logger.info('Node pubkey: ' + that.PeeringService.pubkey);
    return that.initPeer();
  });

  this.recomputeSelfPeer = () => that.PeeringService.generateSelfPeer(that.conf, 0);

  this.initPeer = () => co(function*(){
      yield that.checkConfig();
      yield Q.nbind(that.PeeringService.regularCrawlPeers, that.PeeringService);
      logger.info('Storing self peer...');
      yield that.PeeringService.regularPeerSignal();
      yield Q.nbind(that.PeeringService.regularTestPeers, that.PeeringService);
      yield Q.nbind(that.PeeringService.regularSyncBlock, that.PeeringService);
  });

  this.stopBlockComputation = () => permaProver.stopEveryting();
  
  this.getCountOfSelfMadePoW = () => this.BlockchainService.getCountOfSelfMadePoW();
  this.isServerMember = () => this.BlockchainService.isMember();

  this.isPoWWaiting = () => permaProver.isPoWWaiting();

  this.startBlockComputation = () => permaProver.allowedToStart();

  permaProver.onBlockComputed((block) => co(function*() {
    try {
      const obj = parsers.parseBlock.syncWrite(dos2unix(block.getRawSigned()));
      yield that.singleWritePromise(obj);
    } catch (err) {
      logger.warn('Proof-of-work self-submission: %s', err.message || err);
    }
  }));

  this.checkConfig = () => {
    return that.checkPeeringConf(that.conf);
  };

  this.checkPeeringConf = (conf) => co(function*() {
      if (!conf.pair && conf.passwd == null) {
        throw new Error('No key password was given.');
      }
      if (!conf.pair && conf.salt == null) {
        throw new Error('No key salt was given.');
      }
      if(!conf.ipv4 && !conf.ipv6){
        throw new Error("No interface to listen to.");
      }
      if(!conf.remoteipv4 && !conf.remoteipv6 && !conf.remotehost){
        throw new Error('No interface for remote contact.');
      }
      if (!conf.remoteport) {
        throw new Error('No port for remote contact.');
      }
  });

  this.resetHome = () => co(function *() {
    const params = yield paramsP;
    const myFS = params.fs;
    const rootPath = params.home;
    const existsDir = yield myFS.exists(rootPath);
    if (existsDir) {
      yield myFS.removeTree(rootPath);
    }
  });

  this.resetAll = (done) => co(function*() {
    const files = ['stats', 'cores', 'current', directory.DUNITER_DB_NAME, directory.DUNITER_DB_NAME + '.db', directory.DUNITER_DB_NAME + '.log', directory.WOTB_FILE, 'export.zip', 'import.zip', 'conf'];
    const dirs  = ['blocks', 'ud_history', 'branches', 'certs', 'txs', 'cores', 'sources', 'links', 'ms', 'identities', 'peers', 'indicators', 'leveldb'];
    return resetFiles(files, dirs, done);
  });

  this.resetData = (done) => co(function*(){
    const files = ['stats', 'cores', 'current', directory.DUNITER_DB_NAME, directory.DUNITER_DB_NAME + '.db', directory.DUNITER_DB_NAME + '.log', directory.WOTB_FILE];
    const dirs  = ['blocks', 'ud_history', 'branches', 'certs', 'txs', 'cores', 'sources', 'links', 'ms', 'identities', 'peers', 'indicators', 'leveldb'];
    yield resetFiles(files, dirs, done);
  });

  this.resetConf = (done) => {
    const files = ['conf'];
    const dirs  = [];
    return resetFiles(files, dirs, done);
  };

  this.resetStats = (done) => {
    const files = ['stats'];
    const dirs  = ['ud_history'];
    return resetFiles(files, dirs, done);
  };

  this.resetPeers = (done) => {
    return that.dal.resetPeers(done);
  };

  this.exportAllDataAsZIP = () => co(function *() {
    const params = yield paramsP;
    const rootPath = params.home;
    const myFS = params.fs;
    const archive = archiver('zip');
    if (yield myFS.exists(path.join(rootPath, 'indicators'))) {
      archive.directory(path.join(rootPath, 'indicators'), '/indicators', undefined, { name: 'indicators'});
    }
    const files = ['duniter.db', 'stats.json', 'wotb.bin'];
    for (const file of files) {
      if (yield myFS.exists(path.join(rootPath, file))) {
        archive.file(path.join(rootPath, file), { name: file });
      }
    }
    archive.finalize();
    return archive;
  });

  this.importAllDataFromZIP = (zipFile) => co(function *() {
    const params = yield paramsP;
    yield that.resetData();
    const output = unzip.Extract({ path: params.home });
    fs.createReadStream(zipFile).pipe(output);
    return new Promise((resolve, reject) => {
      output.on('error', reject);
      output.on('close', resolve);
    });
  });

  this.cleanDBData = () => co(function *() {
    yield that.dal.cleanCaches();
    that.dal.wotb.resetWoT();
    const files = ['stats', 'cores', 'current', directory.DUNITER_DB_NAME, directory.DUNITER_DB_NAME + '.db', directory.DUNITER_DB_NAME + '.log'];
    const dirs  = ['blocks', 'ud_history', 'branches', 'certs', 'txs', 'cores', 'sources', 'links', 'ms', 'identities', 'peers', 'indicators', 'leveldb'];
    return resetFiles(files, dirs);
  });

  function resetFiles(files, dirs, done) {
    return co(function *() {
      try {
        const params = yield paramsP;
        const myFS = params.fs;
        const rootPath = params.home;
        for (const fName of files) {
          // JSON file?
          const existsJSON = yield myFS.exists(rootPath + '/' + fName + '.json');
          if (existsJSON) {
            const theFilePath = rootPath + '/' + fName + '.json';
            yield myFS.remove(theFilePath);
            if (yield myFS.exists(theFilePath)) {
              throw Error('Failed to delete file "' + theFilePath + '"');
            }
          } else {
            // Normal file?
            const normalFile = path.join(rootPath, fName);
            const existsFile = yield myFS.exists(normalFile);
            if (existsFile) {
              yield myFS.remove(normalFile);
              if (yield myFS.exists(normalFile)) {
                throw Error('Failed to delete file "' + normalFile + '"');
              }
            }
          }
        }
        for (const dirName of dirs) {
          const existsDir = yield myFS.exists(rootPath + '/' + dirName);
          if (existsDir) {
            yield myFS.removeTree(rootPath + '/' + dirName);
            if (yield myFS.exists(rootPath + '/' + dirName)) {
              throw Error('Failed to delete folder "' + rootPath + '/' + dirName + '"');
            }
          }
        }
        done && done();
    } catch(e) {
          done && done(e);
          throw e;
      }
    });
  }

  this.disconnect = () => Promise.resolve(that.dal && that.dal.close());

  this.pullBlocks = that.PeeringService.pullBlocks;

  // Unit Tests or Preview method
  this.doMakeNextBlock = (manualValues) => that.BlockchainService.makeNextBlock(null, null, manualValues);

  this.doCheckBlock = (block) => {
    const parsed = parsers.parseBlock.syncWrite(block.getRawSigned());
    return that.BlockchainService.checkBlock(parsed, false);
  };

  this.revert = () => this.BlockchainService.revertCurrentBlock();

  this.revertTo = (number) => co(function *() {
    const current = yield that.BlockchainService.current();
    for (let i = 0, count = current.number - number; i < count; i++) {
      yield that.BlockchainService.revertCurrentBlock();
    }
    if (current.number <= number) {
      logger.warn('Already reached');
    }
  });

  this.reapplyTo = (number) => co(function *() {
    const current = yield that.BlockchainService.current();
    if (current.number == number) {
      logger.warn('Already reached');
    } else {
      for (let i = 0, count = number - current.number; i < count; i++) {
        yield that.BlockchainService.applyNextAvailableFork();
      }
    }
  });

  this.singleWritePromise = (obj) => that.submit(obj);

  let theRouter;

  this.router = (active) => {
    if (!theRouter) {
      theRouter = router(that.PeeringService, that.conf, that.dal);
    }
    theRouter.setActive(active !== false);
    return theRouter;
  };

  /**
   * Synchronize the server with another server.
   *
   * If local server's blockchain is empty, process a fast sync: **no block is verified in such a case**, unless
   * you force value `askedCautious` to true.
   *
   * @param onHost Syncs on given host.
   * @param onPort Syncs on given port.
   * @param upTo Sync up to this number, if `upTo` value is a positive integer.
   * @param chunkLength Length of each chunk of blocks to download. Kind of buffer size.
   * @param interactive Tell if the loading bars should be used for console output.
   * @param askedCautious If true, force the verification of each downloaded block. This is the right way to have a valid blockchain for sure.
   * @param nopeers If true, sync will omit to retrieve peer documents.
   * @param noShufflePeers If true, sync will NOT shuffle the retrieved peers before downloading on them.
   */
  this.synchronize = (onHost, onPort, upTo, chunkLength, interactive, askedCautious, nopeers, noShufflePeers) => {
    const remote = new Synchroniser(that, onHost, onPort, that.conf, interactive === true);
    const syncPromise = remote.sync(upTo, chunkLength, askedCautious, nopeers, noShufflePeers === true);
    return {
      flow: remote,
      syncPromise: syncPromise
    };
  };
  
  this.testForSync = (onHost, onPort) => {
    const remote = new Synchroniser(that, onHost, onPort);
    return remote.test();
  };

  /**
   * Enable routing features:
   *   - The server will try to send documents to the network
   *   - The server will eventually be notified of network failures
   */
  this.routing = () => {
    // The router asks for multicasting of documents
    this.pipe(this.router())
      // The documents get sent to peers
      .pipe(multicaster(this.conf))
      // The multicaster may answer 'unreachable peer'
      .pipe(this.router());
  };

  this.upnp = () => co(function *() {
    const upnpAPI = yield upnp(that.conf.port, that.conf.remoteport);
    that.upnpAPI = upnpAPI;
    return upnpAPI;
  });

  this.applyCPU = (cpu) => that.BlockchainService.changeProverCPUSetting(cpu);
  
  this.rawer = rawer;

  this.writeRaw = (raw, type) => co(function *() {
    const parser = documentsMapping[type] && documentsMapping[type].parser;
    const obj = parser.syncWrite(raw);
    return yield that.singleWritePromise(obj);
  });

  /**
   * Retrieve the last linesQuantity lines from the log file.
   * @param linesQuantity
   */
  this.getLastLogLines = (linesQuantity) => this.dal.getLogContent(linesQuantity);

  this.startServices = () => co(function*(){

    /***************
     * HTTP ROUTING
     **************/
    that.router(that.conf.routing);

    /***************
     *    UPnP
     **************/
    if (that.conf.upnp) {
      try {
        if (that.upnpAPI) {
          that.upnpAPI.stopRegular();
        }
        yield that.upnp();
        that.upnpAPI.startRegular();
      } catch (e) {
        logger.warn(e);
      }
    }

    /*******************
     * BLOCK COMPUTING
     ******************/
    if (that.conf.participate) {
      that.startBlockComputation();
    }

    /***********************
     * CRYPTO NETWORK LAYER
     **********************/
    yield that.start();
  });

  this.stopServices = () => co(function*(){
    that.router(false);
    if (that.conf.participate) {
      that.stopBlockComputation();
    }
    return that.PeeringService.stopRegular();
  });
}

util.inherits(Server, stream.Duplex);

module.exports = Server;
