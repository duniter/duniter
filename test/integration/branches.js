"use strict";

var Q         = require('q');
var _         = require('underscore');
var should    = require('should');
var ucoin     = require('./../../index');
var bma       = require('./../../app/lib/streams/bma');
var user      = require('./tools/user');
var constants = require('../../app/lib/constants');
var rp        = require('request-promise');
var httpTest  = require('./tools/http');
var commit    = require('./tools/commit');
var sync      = require('./tools/sync');

var expectJSON     = httpTest.expectJSON;
var expectAnswer   = httpTest.expectAnswer;
var expectHttpCode = httpTest.expectHttpCode;

let WebSocket = require('ws');

require('../../app/lib/logger')().mute();

var MEMORY_MODE = true;
var commonConf = {
  ipv4: '127.0.0.1',
  currency: 'bb',
  httpLogs: true,
  forksize: 3,
  parcatipate: false, // TODO: to remove when startGeneration will be an explicit call
  sigQty: 1
};

var s1 = ucoin({
  memory: MEMORY_MODE,
  name: 'bb1'
}, _.extend({
  port: '7778',
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  }
}, commonConf));

var s2 = ucoin({
  memory: MEMORY_MODE,
  name: 'bb2'
}, _.extend({
  port: '7779',
  pair: {
    pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo',
    sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'
  }
}, commonConf));

var s3 = ucoin({
  memory: MEMORY_MODE,
  name: 'bb3'
}, _.extend({
  port: '7780',
  pair: {
    pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV',
    sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'
  }
}, commonConf));

var s4 = ucoin({
  memory: MEMORY_MODE,
  name: 'bb4'
}, _.extend({
  port: '7755',
  pair: {
    pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV',
    sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'
  }
}, commonConf));

var cat = user('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
var toc = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });
var tic = user('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });

describe("Branches", function() {

  before(function() {

    var commitS1 = commit(s1);
    var commitS2 = commit(s2);
    var commitS3 = commit(s3);
    var commitS4 = commit(s4);

    return Q.all([
      s1.initWithDAL().then(bma).then((bmapi) => bmapi.openConnections()),
      s2.initWithDAL().then(bma).then((bmapi) => bmapi.openConnections()),
      s3.initWithDAL().then(bma).then((bmapi) => bmapi.openConnections()),
      s4.initWithDAL().then(bma).then((bmapi) => bmapi.openConnections())
    ])

      .then(function(){
        // Server 1
        return Q()
          .then(function() {
            return cat.selfCertPromise();
          })
          .then(function() {
            return toc.selfCertPromise();
          })
          .then(function() {
            return tic.selfCertPromise();
          })
          .then(_.partial(toc.certPromise, cat))
          .then(_.partial(cat.certPromise, toc))
          .then(_.partial(cat.certPromise, tic))
          .then(cat.joinPromise)
          .then(toc.joinPromise)
          .then(tic.joinPromise)
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
          .then(commitS2)
          .then(commitS2);
      })

      .then(function(){
        // Server 3
        return Q()
          .then(function(){
            return sync(0, 3, s1, s3);
          })
          .then(commitS3);
      })

      .then(function(){
        // Server 4
        return Q()
          .then(function(){
            return sync(0, 0, s1, s4);
          })
          .then(commitS4);
      })

      // So we now have blocks:
      // S1 11111
      // S2 11122
      // S3 11113
      // S4 14

      .then(function(){
        // Forking S1 from S2
        return Q()
          .then(function(){
            // We try to have:
            // S1 11111
            //      `2
            return sync(3, 3, s2, s1);
          });
      })

      .then(function(){
        // Forking S1 from S3
        return Q()
          .then(function(){
            // We try to have:
            // S1 11111
            //      |`3
            //      `2
            return sync(4, 4, s3, s1);
          });
      })

      .then(function(){
        // Confirmed of S2 from S3
        return Q()
          .then(function(){
            // We try to have:
            // S2 11122
            //    `3
            return sync(1, 1, s3, s2)
              .then(function(){
                throw 'Should have thrown an error since it is not forkable';
              })
              .catch(function(err){
                err.should.match(/^Already processed/);
              });
          });
      })

      .then(function(){
        // Confirmed of S2 from S4
        return Q()
          .then(function(){
            // We try to have:
            // S2 11122
            //    `4
            return sync(1, 1, s4, s2)
              .then(function(){
                throw 'Should have thrown an error since it is not forkable';
              })
              .catch(function(err){
                err.should.match(/^Block out of fork window/);
              });
          });
      })

      .then(function(){
        // Forking S2 from S3
        return Q()
          .then(function(){
            return sync(3, 4, s3, s2);
          });
      })
      ;
  });

  describe("Server 1 /blockchain", function() {

    it('should have a 3 blocks fork window size', function() {
      return expectAnswer(rp('http://127.0.0.1:7778/node/summary', { json: true }), function(res) {
        res.should.have.property('ucoin').property('software').equal('ucoind');
        res.should.have.property('ucoin').property('version').equal('0.20.0a17');
        res.should.have.property('ucoin').property('forkWindowSize').equal(3);
      });
    });

    it('should have an open websocket on /ws/block', function() {
      var ws = new WebSocket('ws://127.0.0.1:7778/ws/block');
      return Q.Promise(function(resolve, reject){
        ws.on('message', function(data){
          should.exist(data);
          resolve(data);
        });
        ws.on('error', reject);
      });
    });

    it('/block/0 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7778/blockchain/block/0', { json: true }), {
        number: 0
      });
    });

    it('/block/1 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7778/blockchain/block/1', { json: true }), {
        number: 1
      });
    });

    it('/block/88 should not exist', function() {
      return expectHttpCode(404, rp('http://127.0.0.1:7778/blockchain/block/88'));
    });

    it('/current should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7778/blockchain/current', { json: true }), {
        number: 4
      });
    });

    it('should have 3 branch', function() {
      return expectAnswer(rp('http://127.0.0.1:7778/blockchain/branches', { json: true }), function(res) {
        res.should.have.property('blocks').length(3);
      });
    });
  });

  describe("Server 2 /blockchain", function() {
  //
    it('/block/0 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7779/blockchain/block/0', { json: true }), {
        number: 0
      });
    });

    it('/block/1 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7779/blockchain/block/1', { json: true }), {
        number: 1
      });
    });

    it('/block/88 should not exist', function() {
      return expectHttpCode(404, rp('http://127.0.0.1:7779/blockchain/block/88'));
    });

    it('/current should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7779/blockchain/current', { json: true }), {
        number: 4
      });
    });

    it('should have 2 branch', function() {
      return expectAnswer(rp('http://127.0.0.1:7779/blockchain/branches', { json: true }), function(res) {
        res.should.have.property('blocks').length(2);
      });
    });
  });

  describe("Server 3 /blockchain", function() {

    it('/block/0 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7780/blockchain/block/0', { json: true }), {
        number: 0
      });
    });

    it('/block/1 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7780/blockchain/block/1', { json: true }), {
        number: 1
      });
    });

    it('/block/88 should not exist', function() {
      return expectHttpCode(404, rp('http://127.0.0.1:7780/blockchain/block/88'));
    });

    it('/current should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7780/blockchain/current', { json: true }), {
        number: 4
      });
    });

    it('should have 1 branch', function() {
      return expectAnswer(rp('http://127.0.0.1:7780/blockchain/branches', { json: true }), function(res) {
        res.should.have.property('blocks').length(1);
      });
    });
  });
});
