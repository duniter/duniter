"use strict";
var stream      = require('stream');
var async       = require('async');
var util        = require('util');
var path        = require('path');
var co          = require('co');
var _           = require('underscore');
var Q           = require('q');
var parsers     = require('./app/lib/streams/parsers/doc');
var constants   = require('./app/lib/constants');
var fileDAL     = require('./app/lib/dal/fileDAL');
var jsonpckg    = require('./package.json');
var router      = require('./app/lib/streams/router');
var base58      = require('./app/lib/base58');
var crypto      = require('./app/lib/crypto');
var signature   = require('./app/lib/signature');
var directory   = require('./app/lib/directory');
var dos2unix    = require('./app/lib/dos2unix');
var Synchroniser = require('./app/lib/sync');
var multicaster = require('./app/lib/streams/multicaster');
var upnp        = require('./app/lib/upnp');
var bma         = require('./app/lib/streams/bma');

function Server (dbConf, overrideConf) {

  stream.Duplex.call(this, { objectMode: true });

  let home = directory.getHome(dbConf.name, dbConf.home);
  let paramsP = directory.getHomeParams(dbConf && dbConf.memory, home);
  let logger = require('./app/lib/logger')('server');
  let that = this;
  that.conf = null;
  that.dal = null;
  that.version = jsonpckg.version;

  that.MerkleService       = require("./app/service/MerkleService");
  that.ParametersService   = require("./app/service/ParametersService")();
  that.IdentityService     = require('./app/service/IdentityService')();
  that.MembershipService   = require('./app/service/MembershipService')();
  that.PeeringService      = require('./app/service/PeeringService')(that);
  that.BlockchainService   = require('./app/service/BlockchainService')();
  that.TransactionsService = require('./app/service/TransactionsService')();

  // Create document mapping
  let documentsMapping = {
    'identity':      that.IdentityService.submitIdentity,
    'certification': that.IdentityService.submitCertification,
    'revocation':    that.IdentityService.submitRevocation,
    'membership':    that.MembershipService.submitMembership,
    'peer':          that.PeeringService.submitP,
    'transaction':   that.TransactionsService.processTx,
    'block':         _.partial(that.BlockchainService.submitBlock, _, true, constants.NO_FORK_ALLOWED)
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

  this.plugFileSystem = () => co(function *() {
    logger.debug('Plugging file system...');
    let params = yield paramsP;
    that.dal = fileDAL(params);
  });

  this.softResetData = () => co(function *() {
    logger.debug('Soft data reset... [cache]');
    yield that.dal.cleanCaches();
    logger.debug('Soft data reset... [data]');
    yield that.cleanDBData();
  });

  this.loadConf = (useDefaultConf) => co(function *() {
    logger.debug('Loading conf...');
    that.conf = yield that.dal.loadConf(overrideConf, useDefaultConf);
    // Default values
    var defaultValues = {
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
    let pair = null;
    if (that.conf.pair) {
      pair = {
        publicKey: base58.decode(that.conf.pair.pub),
        secretKey: base58.decode(that.conf.pair.sec)
      };
    }
    else if (that.conf.passwd || that.conf.salt) {
      pair = yield Q.nbind(crypto.getKeyPair, crypto)(that.conf.salt, that.conf.passwd);
    }
    else {
      pair = {
        publicKey: base58.decode(constants.CRYPTO.DEFAULT_KEYPAIR.pub),
        secretKey: base58.decode(constants.CRYPTO.DEFAULT_KEYPAIR.sec)
      };
    }
    if (!pair) {
      throw Error('This node does not have a keypair. Use `ucoind wizard key` to fix this.');
    }
    that.pair = pair;
    that.sign = signature.asyncSig(pair);
    // Update services
    [that.IdentityService, that.MembershipService, that.PeeringService, that.BlockchainService, that.TransactionsService].map((service) => {
      service.setConfDAL(that.conf, that.dal, that.pair);
    });
    that.router().setConfDAL(that.conf, that.dal);
    return that.conf;
  });

  this.initWithDAL = () => co(function *() {
    yield that.plugFileSystem();
    yield that.loadConf();
    yield that.initDAL();
    return that;
  });

  this.submit = function (obj, isInnerWrite, done) {
    return co(function *() {
      if (!obj.documentType) {
        throw 'Document type not given';
      }
      try {
        let action = documentsMapping[obj.documentType];
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
        logger.debug(err);
        if (done) {
          isInnerWrite ? done(err, null) : done();
        } else {
          throw err;
        }
      }
    });
  };

  this.submitP = (obj, isInnerWrite) => Q.nbind(this.submit, this)(obj, isInnerWrite);

  this.readConfFile = () => co(function *() {
    let dal = yield fileDAL.file(home);
    return yield dal.loadConf();
  });

  this.initDAL = () => this.dal.init();

  this.start = function () {
    return that.checkConfig()
      .then(function (){
        // Add signing & public key functions to PeeringService
        logger.info('Node version: ' + that.version);
        logger.info('Node pubkey: ' + that.PeeringService.pubkey);
        return Q.nfcall(that.initPeer);
      });
  };

  this.stop = function () {
    that.BlockchainService.stopCleanMemory();
    return that.PeeringService.stopRegular();
  };

  this.recomputeSelfPeer = function() {
    return Q.nbind(that.PeeringService.generateSelfPeer, that.PeeringService)(that.conf, 0);
  };

  this.initPeer = function (done) {
    async.waterfall([
      function (next){
        that.checkConfig().then(next).catch(next);
      },
      function (next){
        that.PeeringService.regularCrawlPeers(next);
      },
      function (next){
        logger.info('Storing self peer...');
        that.PeeringService.regularPeerSignal(next);
      },
      function(next) {
        that.PeeringService.regularTestPeers(next);
      },
      function (next){
        that.PeeringService.regularSyncBlock(next);
      },
      function (next){
        that.BlockchainService.regularCleanMemory(next);
      }
    ], done);
  };

  let shouldContinue = false;

  this.stopBlockComputation = function() {
    shouldContinue = false;
    that.BlockchainService.stopPoWThenProcessAndRestartPoW();
  };

  this.startBlockComputation = function() {
    shouldContinue = true;
    return co(function *() {
      while (shouldContinue) {
        try {
          let block = yield that.BlockchainService.startGeneration();
          if (block && shouldContinue) {
            try {
              let obj = parsers.parseBlock.syncWrite(dos2unix(block.getRawSigned()));
              yield that.singleWritePromise(obj);
            } catch (err) {
              logger.warn('Proof-of-work self-submission: %s', err.message || err);
            }
          }
        }
        catch (e) {
          logger.error(e);
          shouldContinue = true;
        }
      }
      logger.info('Proof-of-work computation STOPPED.');
    });
  };

  this.checkConfig = function () {
    return that.checkPeeringConf(that.conf);
  };

  this.checkPeeringConf = function (conf) {
    return Q()
      .then(function(){
        if (!conf.pair && conf.passwd == null) {
          throw new Error('No key password was given.');
        }
        if (!conf.pair && conf.salt == null) {
          throw new Error('No key salt was given.');
        }
        if (!conf.currency) {
          throw new Error('No currency name was given.');
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
  };

  this.resetAll = function(done) {
    var files = ['stats', 'cores', 'current', 'conf', directory.UCOIN_DB_NAME, directory.UCOIN_DB_NAME + '.db', directory.WOTB_FILE];
    var dirs  = ['blocks', 'ud_history', 'branches', 'certs', 'txs', 'cores', 'sources', 'links', 'ms', 'identities', 'peers', 'indicators', 'leveldb'];
    return resetFiles(files, dirs, done);
  };

  this.resetData = function(done) {
    return co(function*(){
      var files = ['stats', 'cores', 'current', directory.UCOIN_DB_NAME, directory.UCOIN_DB_NAME + '.db', directory.UCOIN_DB_NAME + '.log', directory.WOTB_FILE];
      var dirs  = ['blocks', 'ud_history', 'branches', 'certs', 'txs', 'cores', 'sources', 'links', 'ms', 'identities', 'peers', 'indicators', 'leveldb'];
      yield resetFiles(files, dirs, done);
    });
  };

  this.resetConf = function(done) {
    var files = ['conf'];
    var dirs  = [];
    return resetFiles(files, dirs, done);
  };

  this.resetStats = function(done) {
    var files = ['stats'];
    var dirs  = ['ud_history'];
    return resetFiles(files, dirs, done);
  };

  this.resetPeers = function(done) {
    return that.dal.resetPeers(done);
  };

  this.cleanDBData = () => co(function *() {
    yield _.values(that.dal.newDals).map((dal) => dal.cleanData && dal.cleanData());
    that.dal.wotb.resetWoT();
    var files = ['stats', 'cores', 'current'];
    var dirs  = ['blocks', 'ud_history', 'branches', 'certs', 'txs', 'cores', 'sources', 'links', 'ms', 'identities', 'peers', 'indicators', 'leveldb'];
    return resetFiles(files, dirs);
  });

  function resetFiles(files, dirs, done) {
    return co(function *() {
      let params = yield paramsP;
      let myFS = params.fs;
      let rootPath = params.home;
      for (let i = 0, len = files.length; i < len; i++) {
        let fName = files[i];
        // JSON file?
        let existsJSON = yield myFS.exists(rootPath + '/' + fName + '.json');
        if (existsJSON) {
          yield myFS.remove(rootPath + '/' + fName + '.json');
        } else {
          // Normal file?
          let normalFile = path.join(rootPath, fName);
          let existsFile = yield myFS.exists(normalFile);
          if (existsFile) {
            yield myFS.remove(normalFile);
          }
        }
      }
      for (let i = 0, len = dirs.length; i < len; i++) {
        let dirName = dirs[i];
        let existsDir = yield myFS.exists(rootPath + '/' + dirName);
        if (existsDir) {
          yield myFS.removeTree(rootPath + '/' + dirName);
        }
      }
      done && done();
    })
        .catch((err) => {
          done && done(err);
          throw err;
        });
  }

  this.disconnect = function() {
    return that.dal && that.dal.close();
  };

  this.pullBlocks = that.PeeringService.pullBlocks;

  this.doMakeNextBlock = (manualValues) => that.BlockchainService.makeNextBlock(null, null, null, manualValues);

  this.doCheckBlock = function(block) {
    var parsed = parsers.parseBlock.syncWrite(block.getRawSigned());
    return that.BlockchainService.checkBlock(parsed, false);
  };

  this.revert = () => this.BlockchainService.revertCurrentBlock();

  this.revertTo = (number) => co(function *() {
    let current = yield that.BlockchainService.current();
    for (let i = 0, count = current.number - number; i < count; i++) {
      yield that.BlockchainService.revertCurrentBlock();
    }
    if (current.number <= number) {
      logger.warn('Already reached');
    }
    that.BlockchainService.revertCurrentBlock();
  });

  this.singleWritePromise = (obj) => that.submit(obj);

  var theRouter;

  this.router = function(active) {
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
   */
  this.synchronize = (onHost, onPort, upTo, chunkLength, interactive, askedCautious, nopeers) => {
    let remote = new Synchroniser(that, onHost, onPort, that.conf, interactive === true);
    let syncPromise = remote.sync(upTo, chunkLength, askedCautious, nopeers);
    return {
      flow: remote,
      syncPromise: syncPromise
    };
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
    let upnpAPI = yield upnp(that.conf.port, that.conf.remoteport);
    that.upnpAPI = upnpAPI;
    return upnpAPI;
  });
  
  this.listenToTheWeb = (showLogs) => co(function *() {
    let bmapi = yield bma(that, [{
      ip: that.conf.ipv4,
      port: that.conf.port
    }], showLogs);
    return bmapi.openConnections();
  });
}

util.inherits(Server, stream.Duplex);

module.exports = Server;
