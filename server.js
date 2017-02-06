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
const keyring      = require('duniter-common').keyring;
const directory   = require('./app/lib/system/directory');
const rawer       = require('duniter-common').rawer;

function Server (home, memoryOnly, overrideConf) {

  stream.Duplex.call(this, { objectMode: true });

  const paramsP = directory.getHomeParams(memoryOnly, home);
  const logger = require('./app/lib/logger')('server');
  const that = this;
  that.home = home;
  that.conf = null;
  that.dal = null;
  that.version = jsonpckg.version;
  that.logger = logger;

  // External libs
  that.lib = {};
  that.lib.keyring = require('duniter-common').keyring;
  that.lib.Identity = require('./app/lib/entity/identity');
  that.lib.Certification = require('./app/lib/entity/certification');
  that.lib.Transaction = require('./app/lib/entity/transaction');
  that.lib.Peer = require('./app/lib/entity/peer');
  that.lib.Membership = require('./app/lib/entity/membership');
  that.lib.Block = require('./app/lib/entity/block');
  that.lib.Stat = require('./app/lib/entity/stat');
  that.lib.rawer = require('duniter-common').rawer;
  that.lib.parsers = require('./app/lib/streams/parsers');
  that.lib.http2raw = require('duniter-bma').duniter.methods.http2raw;
  that.lib.dos2unix = require('duniter-common').dos2unix;
  that.lib.contacter = require('duniter-crawler').duniter.methods.contacter;
  that.lib.bma = require('duniter-bma').duniter.methods.bma;
  that.lib.network = require('./app/lib/system/network');
  that.lib.constants = require('./app/lib/constants');
  that.lib.ucp = require('duniter-common').buid;
  that.lib.hashf = require('duniter-common').hashf;
  that.lib.indexer = require('./app/lib/dup/indexer');
  that.lib.rules = require('./app/lib/rules');

  that.MerkleService       = require("./app/lib/helpers/merkle");
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
    // Extract key pair
    that.keyPair = keyring.Key(that.conf.pair.pub, that.conf.pair.sec);
    that.sign = that.keyPair.sign;
    // Update services
    [that.IdentityService, that.MembershipService, that.PeeringService, that.BlockchainService, that.TransactionsService].map((service) => {
      service.setConfDAL(that.conf, that.dal, that.keyPair);
    });
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

  this.initDAL = () => co(function*() {
    yield that.dal.init();
    // Maintenance
    let head_1 = yield that.dal.bindexDAL.head(1);
    if (head_1) {
      // Case 1: b_index < block
      yield that.dal.blockDAL.exec('DELETE FROM block WHERE NOT fork AND number > ' + head_1.number);
      // Case 2: b_index > block
      const current = yield that.dal.blockDAL.getCurrent();
      const nbBlocksToRevert = (head_1.number - current.number);
      for (let i = 0; i < nbBlocksToRevert; i++) {
        yield that.revert();
      }
    }
  });

  this.recomputeSelfPeer = () => that.PeeringService.generateSelfPeer(that.conf, 0);

  this.getCountOfSelfMadePoW = () => this.BlockchainService.getCountOfSelfMadePoW();
  this.isServerMember = () => this.BlockchainService.isMember();

  this.checkConfig = () => co(function*() {
    if (!that.conf.pair) {
      throw new Error('No keypair was given.');
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
}

util.inherits(Server, stream.Duplex);

module.exports = Server;
