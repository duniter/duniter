"use strict";
var Q = require('q');
var _ = require('underscore');
var async  = require('async');
var request  = require('request');
var vucoin = require('vucoin');
var ucoin  = require('../../../index');
var bma    = require('../../../app/lib/streams/bma');
var multicaster = require('../../../app/lib/streams/multicaster');
var Configuration = require('../../../app/lib/entity/configuration');
var Peer          = require('../../../app/lib/entity/peer');

module.exports = function (dbName, options) {
  return new Node(dbName, options);
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
          vucoin(options.remoteipv4, options.remoteport, next);
        },
        function (node, next) {
          that.http = node;
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
  this.commit = function() {
    return function(done) {
      async.waterfall([
        function(next) {
          async.parallel({
            block: function(callback){
              that.server.BlockchainService.generateNext().then(_.partial(callback, null)).catch(callback);
            },
            sigFunc: function(callback){
              require('../../../app/lib/signature').sync(that.server.pair, callback);
            }
          }, next);
        },
        function(res, next) {
          var block = res.block;
          var sigFunc = res.sigFunc;
          var pub = that.server.PeeringService.pubkey;
          proveAndSend(that.server, block, sigFunc, pub, block.powMin, next);
        }
      ], function(err) {
        done(err);
      });
    };
  };

  function proveAndSend (server, block, sigFunc, issuer, difficulty, done) {
    var BlockchainService = server.BlockchainService;
    async.waterfall([
      function (next){
        block.issuer = issuer;
        BlockchainService.prove(block, sigFunc, difficulty, next);
      },
      function (provenBlock, next){
        provenBlock && provenBlock.getRawSigned && logger.debug(provenBlock.getRawSigned());
        post('/blockchain/block', {
          "block": provenBlock.getRawSigned()
        }, next);
      }
    ], done);
  }

  function post(uri, data, done) {
    var postReq = request.post({
      "uri": 'http://' + [that.server.conf.remoteipv4, that.server.conf.remoteport].join(':') + uri,
      "timeout": 1000 * 10
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
          that.server.start()
            .then(function(){
              if (server.conf.routing) {
                server
                  .pipe(server.router()) // The router asks for multicasting of documents
                  .pipe(multicaster());
              }
              started = true;
              next();
            })
            .catch(next);
        },
        function (next) {
          vucoin(options.remoteipv4, options.remoteport, next);
        },
        function (node, next) {
          that.http = node;
          next();
        }
      ], function(err) {
        err ? reject(err) : resolve(that.server);
        done && done(err);
      });
    })
      .then(function(server){
        return bma(server, [{
          ip: server.conf.ipv4,
          port: server.conf.port
        }]);
      });
  };

  function service(callback) {
    return function () {
      var cbArgs = arguments;
      var dbConf = typeof dbName == 'object' ? dbName : { name: dbName, memory: true };
      var server = ucoin(dbConf, Configuration.statics.complete(options));

      // Initialize server (db connection, ...)
      server.initWithServices()
        .then(function(){
          //cbArgs.length--;
          cbArgs[cbArgs.length++] = server;
          //cbArgs[cbArgs.length++] = server.conf;
          callback(null, server);
        })
        .catch(function(err){
          server.disconnect();
          throw err;
        });
    };
  }

  /************************
   *    TEST UTILITIES
   ************************/

  this.lookup = function(search, callback) {
    return function(done) {
      async.waterfall([
        function(next) {
          that.http.wot.lookup(search, next);
        }
      ], function(err, res) {
        callback(res, done);
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

  this.current = function(callback) {
    return function(done) {
      async.waterfall([
        function(next) {
          that.http.blockchain.current(next);
        }
      ], function(err, current) {
        callback(current, done);
      });
    };
  };

  this.block = function(number, callback) {
    return function(done) {
      async.waterfall([
        function(next) {
          that.http.blockchain.block(number, next);
        }
      ], function(err, block) {
        callback(block, done);
      });
    };
  };

  this.summary = function(callback) {
    return function(done) {
      async.waterfall([
        function(next) {
          that.http.node.summary(next);
        }
      ], function(err, summary) {
        callback(summary, done);
      });
    };
  };

  this.sourcesOf = function(pub, callback) {
    return function(done) {
      async.waterfall([
        function(next) {
          that.http.tx.sources(pub, next);
        }
      ], function(err, res) {
        callback(res, done);
      });
    };
  };

  this.peering = function(done) {
    that.http.network.peering.get(done);
  };

  this.submitPeer = function(peer, done) {
    post('/network/peering/peers', {
      "peer": Peer.statics.peerize(peer).getRawSigned()
    }, done);
  };

  this.commitP = () => Q.nfcall(this.commit());
}
