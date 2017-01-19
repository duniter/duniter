"use strict";
var Q = require('q');
var co = require('co');
var rp     = require('request-promise');
var _ = require('underscore');
var async  = require('async');
var request  = require('request');
var rules = require('../../../app/lib/rules');
var contacter = require('duniter-crawler').duniter.methods.contacter;
var duniter  = require('../../../index');
var multicaster = require('../../../app/lib/streams/multicaster');
var Configuration = require('../../../app/lib/entity/configuration');
var Peer          = require('../../../app/lib/entity/peer');
var user   = require('./user');
var http   = require('./http');
const bma = require('duniter-bma').duniter.methods.bma;

module.exports = function (dbName, options) {
  return new Node(dbName, options);
};

module.exports.statics = {
};

var UNTIL_TIMEOUT = 115000;

function Node (dbName, options) {

  var logger = require('../../../app/lib/logger')(dbName);
  var that = this;
  var started = false;
  that.server = null;
  that.http = null;

  /**
   * To be executed before tests
   * @param scenarios Scenarios to execute: a suite of operations over a node (identities, certs, tx, blocks, ...).
   * @returns {Function} Callback executed by unit test framework.
   */
  this.before = function (scenarios) {
    return function(done) {
      async.waterfall([
        function (next) {
          that.http = contacter(options.remoteipv4, options.remoteport);
          that.executes(scenarios, next);
        }
      ], done);
    };
  };

  this.executes = function (scenarios, done) {
    async.waterfall([
      function(next) {
        async.forEachSeries(scenarios, function(useCase, callback) {
          useCase(callback);
        }, next);
      }
    ], done);
  };

  /**
   * To be exectued after unit tests. Here: clean the database (removal)
   * @returns {Function} Callback executed by unit test framework.
   */
  this.after = function () {
    return function (done) {
      done();
    };
  };

  /**
   * Generates next block and submit it to local node.
   * @returns {Function}
   */
  this.commit = function(params) {
    return function(done) {
      async.waterfall([
        function(next) {
          async.parallel({
            block: function(callback){
              co(function *() {
                try {
                  const block2 = yield require('duniter-prover').duniter.methods.generateTheNextBlock(that.server, params);
                  const trial2 = yield that.server.getBcContext().getIssuerPersonalizedDifficulty(that.server.keyPair.publicKey);
                  const block = yield require('duniter-prover').duniter.methods.generateAndProveTheNext(that.server, block2, trial2, params);
                  callback(null, block);
                } catch (e) {
                  callback(e);
                }
              });
            }
          }, next);
        },
        function(res, next) {
          var block = res.block;
          logger.debug(block.getRawSigned());
          post('/blockchain/block', {
            "block": block.getRawSigned()
          }, next);
        }
      ], function(err, res) {
        done(err, res.body);
      });
    };
  };

  function post(uri, data, done) {
    var postReq = request.post({
      "uri": 'http://' + [that.server.conf.remoteipv4, that.server.conf.remoteport].join(':') + uri,
      "timeout": 1000 * 10,
      "json": true
    }, function (err, res, body) {
      done(err, res, body);
    });
    postReq.form(data);
  }
  
  this.startTesting = function(done) {
    return Q.Promise(function(resolve, reject){
      if (started) return done();
      async.waterfall([
        function(next) {
          service(next)();
        },
        function (server, next){
          // Launching server
          that.server = server;
          started = true;
          next();
        },
        function (next) {
          that.http = contacter(options.remoteipv4, options.remoteport);
          next();
        }
      ], function(err) {
        err ? reject(err) : resolve();
        done && done(err);
      });
    });
  };

  function service(callback) {
    return function () {
      const stack = duniter.statics.simpleStack();
      for (const name of ['duniter-keypair', 'duniter-bma']) {
        stack.registerDependency(require(name), name);
      }
      stack.registerDependency({
        duniter: {
          config: {
            onLoading: (conf, program) => co(function*() {
              options.port = options.port || 8999;
              options.ipv4 = options.ipv4 || "127.0.0.1";
              options.ipv6 = options.ipv6 || null;
              options.remotehost = options.remotehost || null;
              options.remoteipv4 = options.remoteipv4 || null;
              options.remoteipv6 = options.remoteipv6 || null;
              options.remoteport = options.remoteport || 8999;
              const overConf = Configuration.statics.complete(options);
              _.extend(conf, overConf);
            })
          },
          service: {
            process: (server) => _.extend(server, {
              startService: () => {
                logger.debug('Server Servie Started!');
              }
            })
          },
          cli: [{
            name: 'execute',
            desc: 'Unit Test execution',
            onDatabaseExecute: (server, conf, program, params, startServices) => co(function*() {
              yield startServices();
              callback(null, server);
              yield Promise.resolve((res) => null); // Never ending
            })
          }]
        }
      }, 'duniter-automated-test');
      stack.executeStack(['', '', '--mdb', dbName, '--memory', 'execute']);
    };
  }

  /************************
   *    TEST UTILITIES
   ************************/

  this.lookup = function(search, callback) {
    return function(done) {
      co(function*(){
        try {
          const res = yield that.http.getLookup(search);
          callback(res, done);
        } catch (err) {
          logger.error(err);
          callback(null, done);
        }
      });
    };
  };

  this.until = function (eventName, count) {
    var counted = 0;
    var max = count == undefined ? 1 : count;
    return Q.Promise(function (resolve, reject) {
      var finished = false;
      that.server.on(eventName, function () {
        counted++;
        if (counted == max) {
          if (!finished) {
            finished = true;
            resolve();
          }
        }
      });
      setTimeout(function() {
        if (!finished) {
          finished = true;
          reject('Received ' + counted + '/' + count + ' ' + eventName + ' after ' + UNTIL_TIMEOUT + ' ms');
        }
      }, UNTIL_TIMEOUT);
    });
  };

  this.block = function(number, callback) {
    return function(done) {
      co(function*(){
        try {
          const res = yield that.http.getBlock(number);
          callback(res, done);
        } catch (err) {
          logger.error(err);
          callback(null, done);
        }
      });
    };
  };

  this.summary = function(callback) {
    return function(done) {
      co(function*(){
        try {
          const res = yield that.http.getSummary();
          callback(res, done);
        } catch (err) {
          logger.error(err);
          callback(null, done);
        }
      });
    };
  };

  this.peering = function(done) {
    co(function*(){
      try {
        const res = yield that.http.getPeer();
        done(null, res);
      } catch (err) {
        logger.error(err);
        done(err);
      }
    });
  };

  this.peeringP = () => Q.nfcall(this.peering);

  this.submitPeer = function(peer, done) {
    post('/network/peering/peers', {
      "peer": Peer.statics.peerize(peer).getRawSigned()
    }, done);
  };

  this.submitPeerP = (peer) => Q.nfcall(this.submitPeer, peer);

  this.commitP = (params) => Q.nfcall(this.commit(params));
}
