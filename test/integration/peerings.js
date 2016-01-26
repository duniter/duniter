"use strict";

var co        = require('co');
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
var vucoin_p  = require('./tools/vucoin_p');
var until     = require('./tools/until');
var multicaster = require('../../app/lib/streams/multicaster');
var Peer = require('../../app/lib/entity/peer');

var expectJSON     = httpTest.expectJSON;
var expectAnswer   = httpTest.expectAnswer;
var expectHttpCode = httpTest.expectHttpCode;

var MEMORY_MODE = true;
var commonConf = {
  ipv4: '127.0.0.1',
  remoteipv4: '127.0.0.1',
  currency: 'bb',
  httpLogs: true,
  forksize: 3,
  parcatipate: false, // TODO: to remove when startGeneration will be an explicit call
  sigQty: 1
};

var s1 = ucoin({
  memory: MEMORY_MODE,
  name: 'bb_net1'
}, _.extend({
  port: '7784',
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  }
}, commonConf));

var s2 = ucoin({
  memory: MEMORY_MODE,
  name: 'bb_net2'
}, _.extend({
  port: '7785',
  pair: {
    pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo',
    sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'
  }
}, commonConf));

var s3 = ucoin({
  memory: MEMORY_MODE,
  name: 'bb_net3'
}, _.extend({
  port: '7786',
  pair: {
    pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV',
    sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'
  }
}, commonConf));

var cat = user('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
var toc = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });
var tic = user('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });

var now = Math.round(new Date().getTime()/1000);

var nodeS1;
var nodeS2;
var nodeS3;

describe("Network", function() {

  before(function() {

    var commitS1 = commit(s1);
    var commitS2 = commit(s2);
    var commitS3 = commit(s3);

    return [s1, s2, s3].reduce(function(p, server) {
      return p
        .then(function(){
          return server
            .initWithServices()
            .then(bma)
            .then(function(bmaAPI){
              server.bma = bmaAPI;
              server
                .pipe(server.router()) // The router asks for multicasting of documents
                .pipe(multicaster())
                .pipe(server.router());
            })
            .then(function(){
              return server.start();
            });
        });
    }, Q())

      .then(function(){
        return co(function *() {
          nodeS1 = vucoin_p('127.0.0.1', s1.conf.port);
          nodeS2 = vucoin_p('127.0.0.1', s2.conf.port);
          nodeS3 = vucoin_p('127.0.0.1', s3.conf.port);
          // Server 1
          yield cat.selfCertPromise(now);
          yield toc.selfCertPromise(now);
          yield tic.selfCertPromise(now);
          yield toc.certPromise(cat);
          yield cat.certPromise(toc);
          yield cat.certPromise(tic);
          yield cat.joinPromise();
          yield toc.joinPromise();
          yield tic.joinPromise();
          yield commitS1();
          // Server 2 syncs block 0
          yield sync(0, 0, s1, s2);
          // Server 3 syncs block 0
          yield sync(0, 0, s1, s3);
          yield nodeS1.getPeer().then((peer) => nodeS2.postPeer(new Peer(peer).getRawSigned()));
          yield nodeS2.getPeer().then((peer) => nodeS1.postPeer(new Peer(peer).getRawSigned()));
          yield nodeS3.getPeer().then((peer) => nodeS1.postPeer(new Peer(peer).getRawSigned()));
          yield commitS1();
          yield [
            until(s2, 'block', 1),
            until(s3, 'block', 1)
          ];
          // A block was successfully spread accross the network
          yield s2.bma.closeConnections();
          yield commitS1();
          yield [
            until(s3, 'block', 1)
          ];
          // Server 2 syncs block number 2 (it did not have it)
          yield sync(2, 2, s1, s2);
          yield s2.recomputeSelfPeer();
          yield s2.bma.reopenConnections();
          yield [
            until(s2, 'block', 2),
            until(s3, 'block', 2),
            commitS1()
              .then(commitS1)
          ];
          yield commitS3();
          yield [
            until(s1, 'block', 1),
            until(s2, 'block', 1)
          ];
          yield commitS2();
          yield [
            until(s1, 'block', 1),
            until(s3, 'block', 1)
          ];
        });
      })
      ;
  });

  describe("Server 1", function() {

    it('should have a 3 leaves merkle for peers', function() {
      return nodeS1.getPeers().then(function(res) {
        res.should.have.property('leavesCount').equal(3);
      });
    });

    it('/block/0 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7784/blockchain/block/0', { json: true }), {
        number: 0
      });
    });

    it('/current should exist and be 1', function() {
      return expectJSON(rp('http://127.0.0.1:7784/blockchain/current', { json: true }), {
        number: 6
      });
    });
  });

  describe("Server 2", function() {

    it('should have a 3 leaves merkle for peers', function() {
      return nodeS2.getPeers().then(function(res) {
        res.should.have.property('leavesCount').equal(3);
      });
    });

    it('/block/0 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7785/blockchain/block/0', { json: true }), {
        number: 0
      });
    });

    it('/current should exist and be 1', function() {
      return expectJSON(rp('http://127.0.0.1:7785/blockchain/current', { json: true }), {
        number: 6
      });
    });
  });

  describe("Server 3", function() {

    it('should have a 2 leaves merkle for peers', function() {
      return nodeS3.getPeers().then(function(res) {
        res.should.have.property('leavesCount').equal(2);
      });
    });

    it('/block/0 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7786/blockchain/block/0', { json: true }), {
        number: 0
      });
    });

    it('/current should exist and be 1', function() {
      return expectJSON(rp('http://127.0.0.1:7786/blockchain/current', { json: true }), {
        number: 6
      });
    });
  });
});
