"use strict";

var co        = require('co');
var Q         = require('q');
var _         = require('underscore');
var ucoin     = require('./../../index');
var bma       = require('./../../app/lib/streams/bma');
var user      = require('./tools/user');
var rp        = require('request-promise');
var httpTest  = require('./tools/http');
var commit    = require('./tools/commit');
var until     = require('./tools/until');
var multicaster = require('../../app/lib/streams/multicaster');
var Peer = require('../../app/lib/entity/peer');
var vucoin_p  = require('./tools/vucoin_p');
var sync      = require('./tools/sync');

var expectJSON     = httpTest.expectJSON;

var MEMORY_MODE = true;
var commonConf = {
  ipv4: '127.0.0.1',
  remoteipv4: '127.0.0.1',
  currency: 'bb',
  httpLogs: true,
  forksize: 0,
  sigQty: 1
};

var s1 = ucoin({
  memory: MEMORY_MODE,
  name: 'bb7'
}, _.extend({
  port: '7790',
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  },
  powDelay: 1,
  participate: true // TODO: to remove when startGeneration will be an explicit call
}, commonConf));

var s2 = ucoin({
  memory: MEMORY_MODE,
  name: 'bb7_2'
}, _.extend({
  port: '7791',
  pair: {
    pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo',
    sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'
  },
  powDelay: 1,
  participate: true // TODO: to remove when startGeneration will be an explicit call
}, commonConf));

var cat = user('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
var toc = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });
var tic = user('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });
var tuc = user('tuc', { pub: '3conGDUXdrTGbQPMQQhEC4Ubu1MCAnFrAYvUaewbUhtk', sec: '5ks7qQ8Fpkin7ycXpxQSxxjVhs8VTzpM3vEBMqM7NfC1ZiFJ93uQryDcoM93Mj77T6hDAABdeHZJDFnkDb35bgiU'}, { server: s1 });

var nodeS1;
var nodeS2;

describe("Generation", function() {

  before(function() {

    var commitS1 = commit(s1);

    return co(function *() {
      let servers = [s1, s2];
      for (let i = 0; i < servers.length; i++) {
        let server = servers[i];
        yield server.initWithServices();
        server.bma = yield bma(server);
        server
          .pipe(server.router()) // The router asks for multicasting of documents
          .pipe(multicaster())
          .pipe(server.router());
        yield server.start();
      }
      nodeS1 = vucoin_p('127.0.0.1', s1.conf.port);
      nodeS2 = vucoin_p('127.0.0.1', s2.conf.port);
      // Server 1
      yield cat.selfCertPromise();
      yield toc.selfCertPromise();
      yield toc.certPromise(cat);
      yield cat.certPromise(toc);
      yield cat.joinPromise();
      yield toc.joinPromise();
      yield commitS1();
      // Server 2 syncs block 0
      yield sync(0, 0, s1, s2);
      // Let each node know each other
      let peer1 = yield nodeS1.getPeer();
      yield nodeS2.postPeer(new Peer(peer1).getRawSigned());
      let peer2 = yield nodeS2.getPeer();
      yield nodeS1.postPeer(new Peer(peer2).getRawSigned());
      s1.startBlockComputation();
      yield until(s2, 'block', 1);
      s2.startBlockComputation();
      yield [
        until(s1, 'block', 2),
        until(s2, 'block', 2)
      ];
      s1.stopBlockComputation();
      s2.stopBlockComputation();
    });
  });

  describe("Server 1 /blockchain", function() {

    it('/current should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7790/blockchain/current', { json: true }), {
        number: 3
      });
    });

    it('/current should exist on other node too', function() {
      return expectJSON(rp('http://127.0.0.1:7791/blockchain/current', { json: true }), {
        number: 3
      });
    });
  });
});
