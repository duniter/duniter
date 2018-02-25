"use strict";

const co = require('co');
const _         = require('underscore');
const rp        = require('request-promise');
const httpTest  = require('./tools/http');
const node      = require('./tools/node');
const TestUser  = require('./tools/TestUser').TestUser
const commit    = require('./tools/commit');
const sync      = require('./tools/sync');
const until     = require('./tools/until');
const toolbox   = require('./tools/toolbox');
const BlockDTO = require("../../app/lib/dto/BlockDTO");

const expectHttpCode = httpTest.expectHttpCode;
const expectAnswer = httpTest.expectAnswer;

const MEMORY_MODE = true;
const commonConf = {
  ipv4: '127.0.0.1',
  remoteipv4: '127.0.0.1',
  currency: 'bb',
  httpLogs: true,
  forksize: 3,
  sigQty: 1
};

const catKeyPair = {
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  }
};

const tocKeyPair = {
  pair: {
    pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo',
    sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'
  }
};

let s1, s2, cat, toc


describe("Network updating", function() {

  before(function() {

    return co(function *() {

      s1 = toolbox.server(_.clone(catKeyPair));
      s2 = toolbox.server(_.clone(tocKeyPair));

      cat = new TestUser('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
      toc = new TestUser('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });

      const commitS1 = commit(s1);
      const commitS2 = commit(s2);

      yield [s1, s2].reduce((p, server) => co(function*() {
        yield p;
        yield server.initDalBmaConnections()
        require('../../app/modules/router').RouterDependency.duniter.methods.routeToNetwork(server);
      }), Promise.resolve());

      // Server 1
      yield cat.createIdentity();
      yield toc.createIdentity();
      yield toc.cert(cat);
      yield cat.cert(toc);
      yield cat.join();
      yield toc.join();
      for (const i in _.range(32)) {
        yield commitS1(); // block#0
      }
      // // s2 syncs from s1
      yield sync(0, 31, s1, s2);

      const b2 = yield s1.makeNext({});
      yield s1.postBlock(b2);
      yield s2.postBlock(b2);
      yield s1.recomputeSelfPeer(); // peer#1
      yield s1.sharePeeringWith(s2);
      const b3 = yield s1.makeNext({});
      yield s1.postBlock(b3);
      yield s2.postBlock(b3);
      yield s2.waitToHaveBlock(b3.number);
      yield s1.recomputeSelfPeer(); // peer#1
      yield s1.sharePeeringWith(s2);
    });
  });

    describe("Server 1 /network/peering", function() {

      it('/peers?leaf=LEAFDATA', () => co(function*() {
        const data = yield s1.get('/network/peering/peers?leaves=true');
        const leaf = data.leaves[0];
        const res = yield s1.get('/network/peering/peers?leaf=' + leaf);
        res.leaf.value.should.have.property("pubkey").equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
        res.leaf.value.should.have.property("block").match(new RegExp('^3-'));
        res.leaf.value.should.have.property("raw").match(new RegExp('.*Block: 3-.*'));
      }));
    });

    describe("Server 2 /network/peering", function() {

      it('/peers?leaf=LEAFDATA', () => co(function*() {
        const data = yield s2.get('/network/peering/peers?leaves=true');
        const leaf = data.leaves[0];
        const res = yield s2.get('/network/peering/peers?leaf=' + leaf);
        res.leaf.value.should.have.property("pubkey").equal('DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo');
        res.leaf.value.should.have.property("block").match(new RegExp('^0-'));
        res.leaf.value.should.have.property("raw").match(new RegExp('.*Block: 0-.*'));
      }));
    });
  });
