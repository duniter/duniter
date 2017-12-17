"use strict";
import {CrawlerDependency} from "../../app/modules/crawler/index"
import {BmaDependency} from "../../app/modules/bma/index"

const co = require('co');
const _         = require('underscore');
const duniter     = require('../../index');
const bma       = require('../../app/modules/bma').BmaDependency.duniter.methods.bma;
const TestUser  = require('./tools/TestUser').TestUser
const rp        = require('request-promise');
const httpTest  = require('./tools/http');
const commit    = require('./tools/commit');
const sync      = require('./tools/sync');
const cluster   = require('cluster')
const shutDownEngine  = require('./tools/shutDownEngine');

const expectJSON     = httpTest.expectJSON;

const MEMORY_MODE = true;
const commonConf = {
  ipv4: '127.0.0.1',
  currency: 'bb',
  httpLogs: true,
  forksize: 30,
  avgGenTime: 1,
  sigQty: 1
};

let s1:any, s2:any, cat, toc

describe("Switch", function() {

  before(() => co(function *() {

    cluster.setMaxListeners(6)

    s1 = duniter(
      '/bb11',
      MEMORY_MODE,
      _.extend({
        switchOnHeadAdvance: 0,
        port: '7788',
        pair: {
          pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
          sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
        },
        rootoffset: 10,
        sigQty: 1, dt: 1, ud0: 120
      }, commonConf));

    s2 = duniter(
      '/bb12',
      MEMORY_MODE,
      _.extend({
        switchOnHeadAdvance: 0,
        port: '7789',
        pair: {
          pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo',
          sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'
        }
      }, commonConf));

    cat = new TestUser('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
    toc = new TestUser('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });

    yield s1.initWithDAL().then(bma).then((bmapi:any) => bmapi.openConnections());
    yield s2.initWithDAL().then(bma).then((bmapi:any) => bmapi.openConnections());
    s1.addEndpointsDefinitions(() => BmaDependency.duniter.methods.getMainEndpoint(s1.conf))
    s2.addEndpointsDefinitions(() => BmaDependency.duniter.methods.getMainEndpoint(s2.conf))
    yield cat.createIdentity();
    yield toc.createIdentity();
    yield toc.cert(cat);
    yield cat.cert(toc);
    yield cat.join();
    yield toc.join();
    yield commit(s1)();
    yield commit(s1)();
    yield commit(s1)();
    yield sync(0, 2, s1, s2);

    let s2p = yield s2.PeeringService.peer();

    yield commit(s1)();
    yield commit(s1)();
    yield commit(s2)();
    yield commit(s2)();
    yield commit(s2)();
    yield commit(s2)();
    yield commit(s2)();
    yield commit(s2)();
    yield commit(s2)();
    // So we now have:
    // S1 01234
    // S2   `3456789
    yield s1.writePeer(s2p)

    // Forking S1 from S2
    yield CrawlerDependency.duniter.methods.pullBlocks(s1, s2p.pubkey);
    // S1 should have switched to the other branch
  }));

  after(() => {
    cluster.setMaxListeners(3)
    return Promise.all([
      shutDownEngine(s1),
      shutDownEngine(s2)
    ])
  })

  describe("Server 1 /blockchain", function() {

    it('/block/8 should exist on S1', function() {
      return expectJSON(rp('http://127.0.0.1:7788/blockchain/block/8', { json: true }), {
        number: 8
      });
    });

    it('/block/8 should exist on S2', function() {
      return expectJSON(rp('http://127.0.0.1:7789/blockchain/block/8', { json: true }), {
        number: 8
      });
    });
  });
});
