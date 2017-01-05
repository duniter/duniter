"use strict";
var Q = require('q');
var co = require('co');
var rp     = require('request-promise');
var _ = require('underscore');
var async  = require('async');
var request  = require('request');
var rules = require('../../../app/lib/rules');
var contacter = require('../../../app/lib/contacter');
var ucoin  = require('../../../index');
var multicaster = require('../../../app/lib/streams/multicaster');
var Configuration = require('../../../app/lib/entity/configuration');
var Peer          = require('../../../app/lib/entity/peer');
var user   = require('./user');
var http   = require('./http');
const bma = require('../../../app/lib/streams/bma');

var MEMORY_MODE = true;

module.exports = function (dbName, options) {
  return new Node(dbName, options);
};

let AUTO_PORT = 10200;

module.exports.statics = {

  newBasicTxNode: (testSuite) => () => {
    getTxNode(testSuite);
  },

  newBasicTxNodeWithOldDatabase: (testSuite) => () => {
    getTxNode(testSuite, (node) => co(function*() {
      yield node.server.dal.txsDAL.exec('UPDATE txs SET recipients = "[]";');
    }));
  }
};

function getTxNode(testSuite, afterBeforeHook){

  let port = ++AUTO_PORT;
  const now = 1481800000;

  var node2 = new Node({ name: "db_" + port, memory: MEMORY_MODE }, { currency: 'cc', ipv4: 'localhost', port: port, remoteipv4: 'localhost', remoteport: port, upnp: false, httplogs: false,
    pair: {
      pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV',
      sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'
    },
    forksize: 3,
    participate: false, rootoffset: 10,
    sigQty: 1, dt: 1, ud0: 120
  });

  var tic = user('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, node2);
  var toc = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, node2);

  before(() => co(function*() {
    yield node2.startTesting();
    // Self certifications
    yield tic.createIdentity();
    yield toc.createIdentity();
    // Certification;
    yield tic.cert(toc);
    yield toc.cert(tic);
    yield tic.join();
    yield toc.join();
    yield node2.commitP({ time: now });
    yield node2.commitP({ time: now + 10 });
    yield node2.commitP({ time: now + 10 });
    yield tic.sendP(51, toc);

    if (afterBeforeHook) {
      yield afterBeforeHook(node2);
    }
  }));

  after(node2.after());

  node2.rp = (uri) => rp('http://127.0.0.1:' + port + uri, { json: true });

  node2.expectHttp = (uri, callback) => () => http.expectAnswer(node2.rp(uri), callback);

  testSuite(node2);
}

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
                  const block2 = yield that.server.BlockchainService.generateNext(params);
                  const trial2 = yield that.server.getBcContext().getIssuerPersonalizedDifficulty(that.server.keyPair.publicKey);
                  const block = yield that.server.BlockchainService.makeNextBlock(block2, trial2, params);
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
          co(function*(){
            try {
              yield that.server.start();
              if (server.conf.routing) {
                server
                  .pipe(server.router()) // The router asks for multicasting of documents
                  .pipe(multicaster());
              }
              started = true;
              next();
            } catch (e) {
              next(e);
            }
          });
        },
        function (next) {
          that.http = contacter(options.remoteipv4, options.remoteport);
          next();
        }
      ], function(err) {
        err ? reject(err) : resolve(that.server);
        done && done(err);
      });
    })
      .then((server) => co(function*() {
        const bmapi = yield bma(server, [{
          ip: server.conf.ipv4,
          port: server.conf.port
        }], true);
        return bmapi.openConnections();
      }));
  };

  function service(callback) {
    return function () {
      var cbArgs = arguments;
      var dbConf = typeof dbName == 'object' ? dbName : { name: dbName, memory: true };
      var server = ucoin(dbConf, Configuration.statics.complete(options));

      // Initialize server (db connection, ...)
      return co(function*(){
        try {
          yield server.initWithDAL();
          //cbArgs.length--;
          cbArgs[cbArgs.length++] = server;
          //cbArgs[cbArgs.length++] = server.conf;
          callback(null, server);
        } catch (err) {
          server.disconnect();
          throw err;
        }
      });
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
