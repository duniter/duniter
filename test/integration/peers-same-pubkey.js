"use strict";

const co        = require('co');
const _         = require('underscore');
const should    = require('should');
const TestUser  = require('./tools/TestUser').TestUser
const commit    = require('./tools/commit');
const sync      = require('./tools/sync');
const until     = require('./tools/until');
const toolbox   = require('./tools/toolbox');
const PeerDTO   = require('../../app/lib/dto/PeerDTO').PeerDTO

const catKeyPair = {
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  }
};

let s1, s2, s3, cat, toc

describe("Peer document", function() {

  before(() => co(function*() {

    s1 = toolbox.server(_.clone(catKeyPair));
    s2 = toolbox.server(_.clone(catKeyPair));
    s3 = toolbox.server(_.clone(catKeyPair));

    cat = new TestUser('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
    toc = new TestUser('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });

    const commitS1 = commit(s1);
    const commitS2 = commit(s2);

    yield [s1, s2, s3].reduce((p, server) => co(function*() {
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
    yield commitS1(); // block#0
    yield commitS1(); // block#1
    yield s1.recomputeSelfPeer(); // peer#1
    yield commitS1(); // block#2
    // // s2 syncs from s1
    yield sync(0, 2, s1, s2);
    yield toolbox.serverWaitBlock(s1, 2)
    yield [
      s1.get('/network/peering').then((peer) => s2.post('/network/peering/peers', { peer: PeerDTO.fromJSONObject(peer).getRawSigned() })), // peer#2
      until(s2, 'peer', 1)
    ];

    yield [
      commitS2(), // block#3
      toolbox.serverWaitBlock(s1, 3)
    ];

    yield sync(0, 3, s1, s3);
    yield toolbox.serverWaitBlock(s3, 3)

    const peer1 = yield s1.get('/network/peering');
    peer1.should.have.property("block").match(/^2-/);
    yield [
      s3.post('/network/peering/peers', { peer: PeerDTO.fromJSONObject(peer1).getRawSigned() }), // peer#3
      until(s3, 'peer', 2)
    ];
    const peer3 = yield s3.get('/network/peering');
    peer3.should.have.property("block").match(/^3-/);

    yield [
      commitS2(), // block#4
      toolbox.serverWaitBlock(s1, 4),
      toolbox.serverWaitBlock(s3, 4)
    ];

    yield [
      commitS1(), // block#5
      toolbox.serverWaitBlock(s2, 5),
      toolbox.serverWaitBlock(s3, 5)
    ];
  }));

  after(() => {
    return Promise.all([
      s1.closeCluster(),
      s2.closeCluster(),
      s3.closeCluster()
    ])
  })

  describe("Server 1", function() {

    it('should have a 1 leaves merkle for peers', () => s1.expectJSON('/network/peering/peers', {
      leavesCount: 1
    }));

    it('leaf data', () => co(function*() {
      const data = yield s1.get('/network/peering/peers?leaves=true');
      const leaf = data.leaves[0];
      const res = yield s1.get('/network/peering/peers?leaf=' + leaf);
      res.leaf.value.should.have.property("pubkey").equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
      res.leaf.value.should.have.property("block").match(new RegExp('^3-'));
      res.leaf.value.should.have.property("raw").match(new RegExp('.*Block: 3-.*'));
      res.leaf.value.should.have.property("endpoints").length(3);
    }));


    it('peers', () => s1.expectThat('/network/peering', (res) => {
      res.should.have.property("pubkey").equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
      res.should.have.property("block").match(new RegExp('^3-'));
      res.should.have.property("endpoints").length(3);
    }));


    it('peering should have been updated by node 1', () => s1.expectThat('/network/peering', (res) => {
      res.should.have.property("pubkey").equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
      res.should.have.property("block").match(new RegExp('^3-'));
      res.should.have.property("endpoints").length(3);
    }));

    it('current block', () => s1.expectJSON('/blockchain/current', {
      number: 5,
      issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd'
    }));
  });

  describe("Server 2", function() {

    it('should have a 1 leaves merkle for peers', () => s2.expectJSON('/network/peering/peers', {
      leavesCount: 1
    }));


    it('leaf data', () => co(function*() {
      const data = yield s2.get('/network/peering/peers?leaves=true');
      const leaf = data.leaves[0];
      const res = yield s2.get('/network/peering/peers?leaf=' + leaf);
      res.leaf.value.should.have.property("pubkey").equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
      res.leaf.value.should.have.property("block").match(new RegExp('^3-'));
      res.leaf.value.should.have.property("raw").match(new RegExp('.*Block: 3-.*'));
      res.leaf.value.should.have.property("endpoints").length(3);
    }));


    it('peering should have been updated by node 1', () => s2.expectThat('/network/peering', (res) => {
      res.should.have.property("pubkey").equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
      res.should.have.property("block").match(new RegExp('^3-'));
      res.should.have.property("endpoints").length(3);
    }));

    it('current block', () => s2.expectJSON('/blockchain/current', {
      number: 5,
      issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd'
    }));
  });

  describe("Server 3", function() {

    it('should have a 1 leaves merkle for peers', () => s3.expectJSON('/network/peering/peers', {
      leavesCount: 1
    }));

    it('leaf data', () => co(function*() {
      const data = yield s3.get('/network/peering/peers?leaves=true');
      const leaf = data.leaves[0];
      const res = yield s3.get('/network/peering/peers?leaf=' + leaf);
      res.leaf.value.should.have.property("pubkey").equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
      res.leaf.value.should.have.property("block").match(new RegExp('^3-'));
      res.leaf.value.should.have.property("raw").match(new RegExp('.*Block: 3-.*'));
      res.leaf.value.should.have.property("endpoints").length(3);
    }));

    it('peering should have been updated by node 1', () => s3.expectThat('/network/peering', (res) => {
      res.should.have.property("pubkey").equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
      res.should.have.property("block").match(new RegExp('^3-'));
      res.should.have.property("endpoints").length(3);
    }));

    it('current block', () => s3.expectJSON('/blockchain/current', {
      number: 5,
      issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd'
    }));
  });
});
