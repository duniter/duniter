"use strict";
var stream     = require('stream');
var async      = require('async');
var util       = require('util');
var _          = require('underscore');
var Q          = require('q');
var fileDAL  = require('./app/lib/dal/fileDAL');
var jsonpckg   = require('./package.json');
var router      = require('./app/lib/streams/router');
var multicaster = require('./app/lib/streams/multicaster');
var base58      = require('./app/lib/base58');
var crypto      = require('./app/lib/crypto');
var Peer        = require('./app/lib/entity/peer');
var signature   = require('./app/lib/signature');
var common       = require('./app/lib/common');
var INNER_WRITE = true;

// Add methods to String and Date
common.shim();

function Server (dbConf, overrideConf) {

  stream.Duplex.call(this, { objectMode: true });

  var logger = require('./app/lib/logger')('server');
  var that = this;
  var connectionPromise;
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

  this.connectDB = function () {
    // Connect only once
    return connectionPromise || (connectionPromise = that.connect());
  };

  this.initWithServices = function (done) {
    return that.connectDB()
      .then(that.initServices)
      .then(function(err) {
        done && done(err);
        return that;
      })
      .fail(done);
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
          next('Unknown document type ' + JSON.stringify(obj));
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

  this.connect = function () {
    // Init connection
    if (that.dal) {
      return Q();
    }
    var dbType = dbConf && dbConf.memory ? fileDAL.memory : fileDAL.file;
    return dbType(dbConf.name || "default")
      .then(function(dal){
        that.dal = dal;
        return that.dal.loadConf();
      })
      .then(function(conf){
        that.conf = _(conf).extend(overrideConf || {});
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

  this.initPeer = function (done) {
    var conf = that.conf;
    async.waterfall([
      function (next){
        that.checkConfig().then(next).fail(next);
      },
      function (next){
        logger.info('Storing self peer...');
        that.PeeringService.regularPeerSignal(next);
      },
      function(next) {
        that.PeeringService.testPeers(next);
      },
      function (next){
        logger.info('Updating list of peers...');
        that.dal.updateMerkleForPeers(next);
      },
      function (next){
        that.PeeringService.regularSyncBlock(next);
      },
      function (next){
        if (conf.participate) {
          async.forever(
            function tryToGenerateNextBlock(next) {
              async.waterfall([
                function (next) {
                  that.BlockchainService.startGeneration(next);
                },
                function (block, next) {
                  if (block) {
                    var peer = new Peer({endpoints: [['BASIC_MERKLED_API', conf.ipv4, conf.port].join(' ')]});
                    multicaster(conf.isolate).sendBlock(peer, block, next);
                  } else {
                    next();
                  }
                }
              ], function (err) {
                next(err);
              });
            },
            function onError(err) {
              logger.error(err);
              logger.error('Block generation STOPPED.');
            }
          );
        }
        next();
      },
      function (next) {
        // Launch a block analysis
        that.BlockchainService.addStatComputing();
        next();
      }
    ], done);
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

  this.disconnect = function(done) {
    that.dal.close(function (err) {
      if(err)
        logger.error(err);
      if (typeof done == 'function')
        done(err);
    });
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
                    that.BlockchainService.addStatComputing();
                    done(null, block);
                  })
                  .fail(done);
              }
            };
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

  this.singleWriteStream = function (onError) {
    return new TempStream(that, onError);
  };

  function TempStream (parentStream, onError) {

    stream.Duplex.call(this, { objectMode: true });

    var self = this;
    self._write = function (obj, enc, done) {
      parentStream._write(obj, enc, function (err, res) {
        if (err && typeof onError == 'function') onError(err);
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
