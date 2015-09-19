"use strict";

var Q         = require('q');
var _         = require('underscore');
var ucoin     = require('./../../index');
var bma       = require('./../../app/lib/streams/bma');
var user      = require('./tools/user');
var constants = require('../../app/lib/constants');
var rp        = require('request-promise');
var httpTest  = require('./tools/http');
var commit    = require('./tools/commit');
var sync      = require('./tools/sync');

var expectJSON     = httpTest.expectJSON;
var expectHttpCode = httpTest.expectHttpCode;

var MEMORY_MODE = true;
var commonConf = {
  ipv4: '127.0.0.1',
  currency: 'bb',
  httpLogs: true,
  branchesWindowSize: 3,
  parcatipate: false, // TODO: to remove when startGeneration will be an explicit call
  sigQty: 1
};

var s1 = ucoin({
  memory: MEMORY_MODE,
  name: 'bb4'
}, _.extend({
  port: '7781',
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  }
}, commonConf));

var s2 = ucoin({
  memory: MEMORY_MODE,
  name: 'bb5'
}, _.extend({
  port: '7782',
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  }
}, commonConf));

var cat = user('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
var toc = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });

var now = Math.round(new Date().getTime()/1000);

describe("SelfFork", function() {

  before(function() {

    var commitS1 = commit(s1);
    var commitS2 = commit(s2);

    return Q.all([
      s1.initWithServices().then(bma),
      s2.initWithServices().then(bma),
    ])

      .then(function(){
        // Server 1
        return Q()
          .then(function() {
            return cat.selfCertPromise(now);
          })
          .then(function() {
            return toc.selfCertPromise(now);
          })
          .then(_.partial(toc.certPromise, cat))
          .then(_.partial(cat.certPromise, toc))
          .then(cat.joinPromise)
          .then(toc.joinPromise)
          .then(commitS1)
          .then(commitS1)
          .then(commitS1)
          .then(commitS1)
          .then(commitS1);
      })

      .then(function(){
        // Server 2
        return Q()
          .then(function(){
            return sync(0, 2, s1, s2);
          })
          .then(function() {
            return Q.delay(1000);
          })
          .then(commitS2)
          .then(commitS2);
      })

      .then(function(){
        // Forking S1 from S2
        return Q()
          .then(function(){
            return sync(3, 3, s2, s1);
          });
      })

      ;
  });

  describe("Server 1 /blockchain", function() {

    it('/block/0 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7781/blockchain/block/0', { json: true }), {
        number: 0
      });
    });

    it('/block/1 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7781/blockchain/block/1', { json: true }), {
        number: 1
      });
    });

    it('/block/88 should not exist', function() {
      return expectHttpCode(404, rp('http://127.0.0.1:7781/blockchain/block/88'));
    });

    it('/current should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7781/blockchain/current', { json: true }), {
        number: 4
      });
    });

    it('should have 2 branch', function() {
      return s1.BlockchainService.branches()
        .then(function(branches){
          branches.should.have.length(2);
        });
    });
  });

  describe("Server 2 /blockchain", function() {

    it('/block/0 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7782/blockchain/block/0', { json: true }), {
        number: 0
      });
    });

    it('/block/1 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7782/blockchain/block/1', { json: true }), {
        number: 1
      });
    });

    it('/block/88 should not exist', function() {
      return expectHttpCode(404, rp('http://127.0.0.1:7782/blockchain/block/88'));
    });

    it('/current should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7782/blockchain/current', { json: true }), {
        number: 4
      });
    });

    it('should have 1 branch', function() {
      return s2.BlockchainService.branches()
        .then(function(branches){
          branches.should.have.length(1);
        });
    });
  });
});
