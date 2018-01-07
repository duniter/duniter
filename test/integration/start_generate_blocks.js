"use strict";

const co        = require('co');
const _         = require('underscore');
const duniter     = require('../../index');
const bma       = require('../../app/modules/bma').BmaDependency.duniter.methods.bma;
const TestUser  = require('./tools/TestUser').TestUser
const rp        = require('request-promise');
const httpTest  = require('./tools/http');
const commit    = require('./tools/commit');
const until     = require('./tools/until');
const toolbox   = require('./tools/toolbox');
const PeerDTO   = require('../../app/lib/dto/PeerDTO').PeerDTO
const contacter  = require('../../app/modules/crawler').CrawlerDependency.duniter.methods.contacter;
const sync      = require('./tools/sync');
const shutDownEngine  = require('./tools/shutDownEngine');

const expectJSON     = httpTest.expectJSON;

const MEMORY_MODE = true;
const commonConf = {
  bmaWithCrawler: true,
  ipv4: '127.0.0.1',
  remoteipv4: '127.0.0.1',
  currency: 'bb',
  httpLogs: true,
  forksize: 0,
  sigQty: 1
};

let s1, s2, cat, toc, tic, tuc

let nodeS1;
let nodeS2;

describe("Generation", function() {

  before(function() {

    return co(function *() {

      s1 = duniter(
        '/bb7',
        MEMORY_MODE,
        _.extend({
          port: '7790',
          pair: {
            pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
            sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
          },
          powDelay: 1
        }, commonConf));

      s2 = duniter(
        '/bb7_2',
        MEMORY_MODE,
        _.extend({
          port: '7791',
          pair: {
            pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo',
            sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'
          },
          powDelay: 1
        }, commonConf));

      const commitS1 = commit(s1);

      cat = new TestUser('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
      toc = new TestUser('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });
      tic = new TestUser('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });
      tuc = new TestUser('tuc', { pub: '3conGDUXdrTGbQPMQQhEC4Ubu1MCAnFrAYvUaewbUhtk', sec: '5ks7qQ8Fpkin7ycXpxQSxxjVhs8VTzpM3vEBMqM7NfC1ZiFJ93uQryDcoM93Mj77T6hDAABdeHZJDFnkDb35bgiU'}, { server: s1 });

      let servers = [s1, s2];
      for (const server of servers) {
        server.addEndpointsDefinitions(() => require('../../app/modules/bma').BmaDependency.duniter.methods.getMainEndpoint(server.conf))
        yield server.initWithDAL();
        server.bma = yield bma(server);
        yield server.bma.openConnections();
        require('../../app/modules/router').RouterDependency.duniter.methods.routeToNetwork(server);
        yield server.PeeringService.generateSelfPeer(server.conf);
        const prover = require('../../app/modules/prover').ProverDependency.duniter.methods.prover(server);
        server.startBlockComputation = () => prover.startService();
        server.stopBlockComputation = () => prover.stopService();
      }
      nodeS1 = contacter('127.0.0.1', s1.conf.port);
      nodeS2 = contacter('127.0.0.1', s2.conf.port);
      // Server 1
      yield cat.createIdentity();
      yield toc.createIdentity();
      yield toc.cert(cat);
      yield cat.cert(toc);
      yield cat.join();
      yield toc.join();
      yield commitS1();
      // Server 2 syncs block 0
      yield sync(0, 0, s1, s2);
      // Let each node know each other
      let peer1 = yield nodeS1.getPeer();
      yield nodeS2.postPeer(PeerDTO.fromJSONObject(peer1).getRawSigned());
      let peer2 = yield nodeS2.getPeer();
      yield nodeS1.postPeer(PeerDTO.fromJSONObject(peer2).getRawSigned());
      s1.startBlockComputation();
      yield until(s2, 'block', 1);
      s2.startBlockComputation();
      s1.conf.powDelay = 2000;
      s2.conf.powDelay = 2000;
      yield [
        toolbox.serverWaitBlock(s1, 3),
        toolbox.serverWaitBlock(s2, 3)
      ];
      s1.stopBlockComputation();
      s2.stopBlockComputation();
    });
  });

  after(() => {
    return Promise.all([
      shutDownEngine(s1),
      shutDownEngine(s2)
    ])
  })

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
