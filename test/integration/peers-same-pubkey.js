"use strict";

const co        = require('co');
const Q         = require('q');
const _         = require('underscore');
const should    = require('should');
const bma       = require('duniter-bma').duniter.methods.bma;
const user      = require('./tools/user');
const commit    = require('./tools/commit');
const sync      = require('./tools/sync');
const until     = require('./tools/until');
const toolbox   = require('./tools/toolbox');
const multicaster = require('../../app/lib/streams/multicaster');
const Peer = require('../../app/lib/entity/peer');

const catKeyPair = {
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  }
};

const s1 = toolbox.server(_.clone(catKeyPair));
const s2 = toolbox.server(_.clone(catKeyPair));
const s3 = toolbox.server(_.clone(catKeyPair));

const cat = user('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
const toc = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });

describe("Peer document", function() {

  before(() => co(function*() {

    const commitS1 = commit(s1);
    const commitS2 = commit(s2);

    yield [s1, s2, s3].reduce((p, server) => co(function*() {
      yield p;
      yield server.initWithDAL();
      const bmaAPI = yield bma(server);
      yield bmaAPI.openConnections();
      server.bma = bmaAPI;
      require('../../app/modules/router').duniter.methods.routeToNetwork(server);
    }), Q());

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
    yield [
      s1.get('/network/peering').then((peer) => s2.post('/network/peering/peers', { peer: new Peer(peer).getRawSigned() })), // peer#2
      until(s2, 'peer', 1)
    ];

    yield [
      commitS2(), // block#3
      until(s1, 'block', 1)
    ];

    yield sync(0, 3, s1, s3);

    const peer1 = yield s1.get('/network/peering');
    peer1.should.have.property("block").match(/^2-/);
    yield [
      s3.post('/network/peering/peers', { peer: new Peer(peer1).getRawSigned() }), // peer#3
      until(s3, 'peer', 2)
    ];
    const peer3 = yield s3.get('/network/peering');
    peer3.should.have.property("block").match(/^3-/);

    yield [
      commitS2(), // block#4
      until(s1, 'block', 1),
      until(s3, 'block', 1)
    ];

    yield [
      commitS1(), // block#5
      until(s2, 'block', 1),
      until(s3, 'block', 1)
    ];
  }));

  describe("Server 1", function() {

    it('should have a 1 leaves merkle for peers', () => s1.expectJSON('/network/peering/peers', {
      leavesCount: 1
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
