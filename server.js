"use strict";
var stream      = require('stream');
var async       = require('async');
var util        = require('util');
var co          = require('co');
var _           = require('underscore');
var Q           = require('q');
var parsers     = require('./app/lib/streams/parsers/doc');
var constants   = require('./app/lib/constants');
var fileDAL     = require('./app/lib/dal/fileDAL');
var jsonpckg    = require('./package.json');
var router      = require('./app/lib/streams/router');
var multicaster = require('./app/lib/streams/multicaster');
var base58      = require('./app/lib/base58');
var crypto      = require('./app/lib/crypto');
var Peer        = require('./app/lib/entity/peer');
var signature   = require('./app/lib/signature');
var common      = require('./app/lib/common');
var INNER_WRITE = true;

// Add methods to String and Date
common.shim();

function Server (dbConf, overrideConf) {

  stream.Duplex.call(this, { objectMode: true });

  var logger = require('./app/lib/logger')('server');
  var that = this;
  var connectionPromise, servicesPromise;
  that.conf = null;
  that.dal = null;
  that.version = jsonpckg.version;

  var documentsMapping = {};

  // Unused, but made mandatory by Duplex interface
  this._read = function () {
  };

  this._write = function (obj, enc, writeDone, isInnerWrite) {
    that.submit(obj, isInnerWrite, function (err, res) {
      if (isInnerWrite) {
        writeDone(err, res);
      } else {
        writeDone();
      }
    });
  };

  this.connectDB = function (forConf, useDefaultConf) {
    // Connect only once
    return connectionPromise || (connectionPromise = that.connect(forConf, useDefaultConf));
  };

  this.initWithServices = function (done) {
    // Init services only once
    return servicesPromise || (servicesPromise = that.connectDB()
        .then(that.initServices)
        .then(function(err) {
          done && done(err);
          return that;
        })
        .catch(done));
  };

  this.submit = function (obj, isInnerWrite, done) {
    async.waterfall([
      function (next){
        if (!obj.documentType) {
          return next('Document type not given');
        }
        var action = documentsMapping[obj.documentType];
        if (typeof action == 'function') {
          // Handle the incoming object
          action(obj, next);
        } else {
          next('Unknown document type \'' + obj.documentType + '\'');
        }
      }
    ], function (err, res) {
      err && logger.debug(err);
      if (res != null && res != undefined && !err) {
        // Only emit valid documents
        that.emit(obj.documentType, res);
        that.push(res);
      }
      if (isInnerWrite) {
        done(err, res);
      } else {
        done();
      }
    });
  };

  this.connect = function (forConf, useDefaultConf) {
    // Init connection
    if (that.dal) {
      return Q();
    }
    var dbType = dbConf && dbConf.memory ? fileDAL.memory : fileDAL.file;
    return dbType(dbConf.name || "default", forConf)
      .then(function(dal){
        that.dal = dal;
        return that.dal.init(overrideConf, useDefaultConf);
      })
      .then(function(conf){
        that.conf = conf;
        // Default values
        var defaultValues = {
          remoteipv4:         that.conf.ipv4,
          remoteipv6:         that.conf.ipv6,
          remoteport:         that.conf.port,
          cpu:                1,
          c:                  constants.CONTRACT.DEFAULT.C,
          dt:                 constants.CONTRACT.DEFAULT.DT,
          ud0:                constants.CONTRACT.DEFAULT.UD0,
          stepMax:            constants.CONTRACT.DEFAULT.STEPMAX,
          sigDelay:           constants.CONTRACT.DEFAULT.SIGDELAY,
          sigValidity:        constants.CONTRACT.DEFAULT.SIGVALIDITY,
          msValidity:         constants.CONTRACT.DEFAULT.MSVALIDITY,
          sigQty:             constants.CONTRACT.DEFAULT.SIGQTY,
          sigWoT:             constants.CONTRACT.DEFAULT.SIGWOT,
          percentRot:         constants.CONTRACT.DEFAULT.PERCENTROT,
          blocksRot:          constants.CONTRACT.DEFAULT.BLOCKSROT,
          powDelay:           constants.CONTRACT.DEFAULT.POWDELAY,
          avgGenTime:         constants.CONTRACT.DEFAULT.AVGGENTIME,
          dtDiffEval:         constants.CONTRACT.DEFAULT.DTDIFFEVAL,
          medianTimeBlocks:   constants.CONTRACT.DEFAULT.MEDIANTIMEBLOCKS,
          rootoffset:         0,
          branchesWindowSize: constants.BRANCHES.DEFAULT_WINDOW_SIZE
        };
        _.keys(defaultValues).forEach(function(key){
          if (that.conf[key] == undefined) {
            that.conf[key] = defaultValues[key];
          }
        });
      });
  };

  this.start = function () {
    return that.checkConfig()
      .then(function (){
        // Add signing & public key functions to PeeringService
        logger.info('Node version: ' + that.version);
        logger.info('Node pubkey: ' + that.PeeringService.pubkey);
        return Q.nfcall(that.initPeer);
      });
  };

  this.recomputeSelfPeer = function() {
    return Q.nbind(that.PeeringService.generateSelfPeer, that.PeeringService)(that.conf);
  };

  this.initPeer = function (done) {
    async.waterfall([
      function (next){
        that.checkConfig().then(next).catch(next);
      },
      function (next){
        logger.info('Starting core: %s', that.dal.name);
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

  let shouldContinue = true;

  this.stopBlockComputation = function() {
    shouldContinue = false;
  };

  this.startBlockComputation = function() {
    return co(function *() {
      while (shouldContinue) {
        try {
          let block = yield that.BlockchainService.startGeneration();
          if (block && shouldContinue) {
            var peer = new Peer({endpoints: [['BASIC_MERKLED_API', that.conf.ipv4, that.conf.port].join(' ')]});
            yield multicaster(that.conf.isolate, constants.NETWORK.SYNC_LONG_TIMEOUT).sendBlock(peer, block);
          }
        }
        catch (e) {
          logger.error(e);
          shouldContinue = true;
        }
      }
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
        if(!conf.remoteipv4 && !conf.remoteipv6){
          throw new Error('No interface for remote contact.');
        }
        if (!conf.remoteport) {
          throw new Error('No port for remote contact.');
        }
      });
  };

  this.createSignFunction = function (pair, done) {
    signature.async(pair, function (err, sigFunc) {
      that.sign = sigFunc;
      done(err);
    });
  };

  this.reset = function(done) {
    return that.dal.resetAll(done);
  };

  this.resetData = function(done) {
    return that.dal.resetData(done);
  };

  this.resetStats = function(done) {
    return that.dal.resetStats(done);
  };

  this.resetPeers = function(done) {
    return that.dal.resetPeers(done);
  };

  this.resetTxs = function(done) {
    that.dal.resetTransactions(done);
  };

  this.resetConf = function(done) {
    return that.dal.resetConf(done);
  };

  this.disconnect = function() {
    return that.dal.close();
  };

  this.initServices = function() {
    return Q.Promise(function(resolve, reject){
      if (!that.servicesInited) {
        async.waterfall([
          function(next) {
            // Extract key pair
            if (that.conf.pair)
              next(null, {
                publicKey: base58.decode(that.conf.pair.pub),
                secretKey: base58.decode(that.conf.pair.sec)
              });
            else if (that.conf.passwd || that.conf.salt)
              crypto.getKeyPair(that.conf.passwd, that.conf.salt, next);
            else
              next(null, null);
          },
          function (pair, next){
            if (pair) {
              that.pair = pair;
              that.createSignFunction(pair, next);
            }
            else next('This node does not have a keypair. Use `ucoind wizard key` to fix this.');
          },
          function(next) {
            that.servicesInited = true;
            that.HTTPService         = require("./app/service/HTTPService");
            that.MerkleService       = require("./app/service/MerkleService");
            that.ParametersService   = require("./app/service/ParametersService")();
            that.IdentityService     = require('./app/service/IdentityService')(that.conf, that.dal);
            that.MembershipService   = require('./app/service/MembershipService')(that.conf, that.dal);
            that.PeeringService      = require('./app/service/PeeringService')(that, that.pair, that.dal);
            that.BlockchainService   = require('./app/service/BlockchainService')(that.conf, that.dal, that.pair);
            that.TransactionsService = require('./app/service/TransactionsService')(that.conf, that.dal);
            // Create document mapping
            documentsMapping = {
              'identity':    that.IdentityService.submitIdentity,
              'revocation':  that.IdentityService.submitRevocation,
              'membership':  that.MembershipService.submitMembership,
              'peer':        that.PeeringService.submit,
              'transaction': that.TransactionsService.processTx,
              'block':       function (obj, done) {
                that.BlockchainService.submitBlock(obj, true)
                  .then(function(block){
                    that.dal = that.BlockchainService.currentDal;
                    that.IdentityService.setDAL(that.dal);
                    that.MembershipService.setDAL(that.dal);
                    that.PeeringService.setDAL(that.dal);
                    that.TransactionsService.setDAL(that.dal);
                    (theRouter && theRouter.setDAL(that.dal));
                    done(null, block);
                  })
                  .catch(done);
              }
            };
            that.BlockchainService.init(next);
          },
          function(next) {
            that.dal = that.BlockchainService.currentDal;
            that.IdentityService.setDAL(that.dal);
            that.MembershipService.setDAL(that.dal);
            that.PeeringService.setDAL(that.dal);
            that.TransactionsService.setDAL(that.dal);
            (theRouter && theRouter.setDAL(that.dal));
            next();
          }
        ], function(err) {
          err ? reject(err) : resolve();
        });
      } else {
        resolve();
      }
    });
  };

  this.makeNextBlock = function() {
    return that.initWithServices()
      .then(function(){
        return that.BlockchainService.makeNextBlock();
      });
  };

  this.checkBlock = function(block) {
    return that.initWithServices()
      .then(function(){
        var parsed = parsers.parseBlock().syncWrite(block.getRawSigned());
        return that.BlockchainService.checkBlock(parsed, false);
      });
  };

  this.revert = () => this.BlockchainService.revertCurrentBlock();

  this.singleWriteStream = function (onError, onSuccess) {
    return new TempStream(that, onError, onSuccess);
  };

  this.singleWritePromise = function (obj) {
    return Q.Promise(function(resolve, reject){
      new TempStream(that, reject, resolve).write(obj);
    });
  };

  function TempStream (parentStream, onError, onSuccess) {

    stream.Duplex.call(this, { objectMode: true });

    var self = this;
    self._write = function (obj, enc, done) {
      parentStream._write(obj, enc, function (err, res) {
        if (err && typeof onError == 'function') onError(err);
        if (!err && typeof onSuccess == 'function') onSuccess(res);
        if (res) self.push(res);
        self.push(null);
        done();
      }, INNER_WRITE);
    };
    self._read = function () {
    };
  }

  var theRouter;

  this.router = function() {
    if (!theRouter) {
      theRouter = router(that.PeeringService.pubkey, that.conf, that.dal);
    }
    return theRouter;
  };

  util.inherits(TempStream, stream.Duplex);
}

util.inherits(Server, stream.Duplex);

module.exports = Server;
