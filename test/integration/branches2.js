"use strict";

const co        = require('co');
const _         = require('underscore');
const ucoin     = require('../../index');
const bma       = require('../../app/lib/streams/bma');
const user      = require('./tools/user');
const constants = require('../../app/lib/constants');
const rp        = require('request-promise');
const httpTest  = require('./tools/http');
const commit    = require('./tools/commit');
const sync      = require('./tools/sync');

const expectJSON     = httpTest.expectJSON;
const expectHttpCode = httpTest.expectHttpCode;

if (constants.MUTE_LOGS_DURING_UNIT_TESTS) {
  require('../../app/lib/logger')().mute();
}

const MEMORY_MODE = true;
const commonConf = {
  ipv4: '127.0.0.1',
  currency: 'bb',
  httpLogs: true,
  forksize: 10,
  avgGenTime: constants.BRANCHES.SWITCH_ON_BRANCH_AHEAD_BY_X_MINUTES * 60,
  parcatipate: false, // TODO: to remove when startGeneration will be an explicit call
  sigQty: 1
};

const s1 = ucoin({
  memory: MEMORY_MODE,
  name: 'bb4'
}, _.extend({
  port: '7781',
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  }
}, commonConf));

const s2 = ucoin({
  memory: MEMORY_MODE,
  name: 'bb5'
}, _.extend({
  port: '7782',
  pair: {
    pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo',
    sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'
  }
}, commonConf));

const cat = user('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
const toc = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });

const now = Math.round(new Date().getTime() / 1000);

describe("SelfFork", function() {

  before(() => co(function *() {
    const commitS1 = commit(s1);
    const commitS2 = commit(s2, {
      time: now + 10000000
    });

    yield s1.initWithDAL().then(bma).then((bmapi) => bmapi.openConnections());
    yield s2.initWithDAL().then(bma).then((bmapi) => bmapi.openConnections());

    // Server 1
    yield cat.selfCert();
    yield toc.selfCert();
    yield toc.cert(cat);
    yield cat.cert(toc);
    yield cat.join();
    yield toc.join();

    yield commitS1({
      time: now
    });
    yield commitS1();
    yield commitS1();
    yield commitS1();

    // Server 2
    yield sync(0, 2, s1, s2);
    yield function*() {
      yield (cb) => setTimeout(cb, 1000);
    };
    let s2p = yield s2.PeeringService.peer();

    yield commitS2();
    yield commitS2();
    yield commitS2();
    yield commitS2();
    yield commitS2();

    yield s1.singleWritePromise(s2p);

    // Forking S1 from S2
    return s1.pullBlocks(s2p.pubkey);
  }));

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
        number: 7
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
        number: 7
      });
    });

    it('should have 1 branch', () => co(function*() {
      const branches = yield s2.BlockchainService.branches();
      branches.should.have.length(1);
    }));
  });
});
