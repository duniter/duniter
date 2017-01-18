"use strict";

const co        = require('co');
const Q         = require('q');
const should    = require('should');
const es        = require('event-stream');
const _         = require('underscore');
const bma       = require('duniter-bma').duniter.methods.bma;
const user      = require('./tools/user');
const commit    = require('./tools/commit');
const until     = require('./tools/until');
const toolbox   = require('./tools/toolbox');
const multicaster = require('../../app/lib/streams/multicaster');
const Peer = require('../../app/lib/entity/peer');

const s1 = toolbox.server({
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  }
});

const s2 = toolbox.server({
  pair: {
    pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo',
    sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'
  }
});

const cat = user('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
const toc = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });

describe("Peer document expiry", function() {

  let peer1V1;

  before(() => co(function*() {

    const commitS1 = commit(s1);

    yield [s1, s2].reduce((p, server) => co(function*() {
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
    peer1V1 = yield s1.get('/network/peering');
    yield commitS1(); // block#2
    yield s1.recomputeSelfPeer(); // peer#2
    yield s2.syncFrom(s1, 0, 2);
  }));

  it('sending back V1 peer document should return the latest known one', () => co(function*() {
    let res;
    try {
      yield s1.post('/network/peering/peers', { peer: Peer.statics.peerize(peer1V1).getRawSigned() });
    } catch (e) {
      res = e;
    }
    should.exist(res);
    res.should.have.property("error").property("peer").property("block").match(/^2-/);
  }));

  it('routing V1 peer document should raise an "outdated" event', () => co(function*() {
    const caster = multicaster();
    return new Promise((resolve) => {
      caster
        .pipe(es.mapSync((obj) => {
          obj.should.have.property("outdated").equal(true);
          resolve();
        }));
      caster.sendPeering(Peer.statics.peerize(peer1V1), Peer.statics.peerize(peer1V1));
    });
  }));

  it('mirror should have 3 known blocks', () => s2.expectJSON('/blockchain/current', {
    number: 2
  }));

  it('mirror should have 1 known peers', () => s2.expect('/network/peers', (res) => {
    res.should.have.property("peers").length(1);
    res.peers[0].should.have.property("pubkey").equal('DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo');
  }));

  it('routing V1 peer document should inject newer peer', () => co(function*() {
    yield [
      s2.singleWritePromise(_.extend({ documentType: 'peer' }, peer1V1)),
      until(s2, 'peer', 2)
    ];
  }));

  it('mirror should now have 2 known peers', () => s2.expect('/network/peers', (res) => {
    res.should.have.property("peers").length(2);
    res.peers[0].should.have.property("pubkey").equal('DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo');
    res.peers[0].should.have.property("block").match(/^0-/);
    res.peers[1].should.have.property("pubkey").equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
    res.peers[1].should.have.property("block").match(/^2-/);
  }));
});
