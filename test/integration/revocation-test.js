"use strict";

const _         = require('underscore');
const co        = require('co');
const should    = require('should');
const duniter   = require('../../index');
const bma       = require('duniter-bma').duniter.methods.bma;
const user      = require('./tools/user');
const rp        = require('request-promise');
const httpTest  = require('./tools/http');
const commit    = require('./tools/commit');

const expectAnswer  = httpTest.expectAnswer;

const MEMORY_MODE = true;
const commonConf = {
  ipv4: '127.0.0.1',
  currency: 'bb',
  httpLogs: true,
  forksize: 3,
  xpercent: 0.9,
  msValidity: 10000,
  sigQty: 1
};

const s1 = duniter(
  '/bb12',
  MEMORY_MODE,
  _.extend({
  port: '9964',
  pair: {
    pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo',
    sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'
  }
}, commonConf));

const s2 = duniter(
  '/bb13',
  MEMORY_MODE,
  _.extend({
  port: '9965',
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  }
}, commonConf));

const cat = user('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
const tic = user('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });
const toc = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });
const tacOnS1 = user('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, { server: s1 });
const tacOnS2 = user('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, { server: s2 });

const commitS1 = commit(s1);

describe("Revocation", function() {

  before(function() {

    return co(function *() {
      yield s1.initWithDAL().then(bma).then((bmapi) => bmapi.openConnections());
      yield s2.initWithDAL().then(bma).then((bmapi) => bmapi.openConnections());
      yield cat.createIdentity();
      yield tic.createIdentity();
      yield toc.createIdentity();
      yield cat.cert(tic);
      yield tic.cert(cat);
      yield tic.cert(toc);
      yield toc.cert(tic);
      yield cat.join();
      yield tic.join();
      yield toc.join();
      yield commitS1();

      // We have the following WoT:
      /**
       *  cat <-> tic <-> toc
       */
    });
  });

  it('should have 3 members', function() {
    return expectAnswer(rp('http://127.0.0.1:9964/wot/members', { json: true }), function(res) {
      res.should.have.property('results').length(3);
      _.pluck(res.results, 'uid').sort().should.deepEqual(['cat', 'tic', 'toc']);
    });
  });

  it('cat should not be revoked yet', () => expectAnswer(rp('http://127.0.0.1:9964/wot/lookup/cat', { json: true }), function(res) {
    res.should.have.property('results').length(1);
    res.results[0].should.have.property('uids').length(1);
    res.results[0].uids[0].should.have.property('uid').equal('cat');
    res.results[0].uids[0].should.have.property('revoked').equal(false);
    res.results[0].uids[0].should.have.property('revoked_on').equal(null);
    res.results[0].uids[0].should.have.property('revocation_sig').equal(null);
  }));

  it('sending a revocation for cat should be displayed', () => co(function *() {
    yield cat.revoke();
    return expectAnswer(rp('http://127.0.0.1:9964/wot/lookup/cat', { json: true }), function(res) {
      res.should.have.property('results').length(1);
      res.results[0].should.have.property('uids').length(1);
      res.results[0].uids[0].should.have.property('uid').equal('cat');
      res.results[0].uids[0].should.have.property('revoked').equal(false);
      res.results[0].uids[0].should.have.property('revoked_on').equal(null);
      res.results[0].uids[0].should.have.property('revocation_sig').not.equal(null);
      res.results[0].uids[0].should.have.property('revocation_sig').not.equal('');
    });
  }));

  it('sending a revocation for tac should add an identity', () => co(function *() {
    yield tacOnS1.createIdentity();
    const idty = yield tacOnS1.lookup(tacOnS1.pub);
    yield tacOnS2.revoke(idty);
    // On S1 server, tac is known as normal identity
    yield expectAnswer(rp('http://127.0.0.1:9964/wot/lookup/tac', { json: true }), function(res) {
      res.should.have.property('results').length(1);
      res.results[0].should.have.property('uids').length(1);
      res.results[0].uids[0].should.have.property('uid').equal('tac');
      res.results[0].uids[0].should.have.property('revoked').equal(false);
      res.results[0].uids[0].should.have.property('revoked_on').equal(null);
      res.results[0].uids[0].should.have.property('revocation_sig').equal(null);
    });
    // On S2 server, tac is known as identity with revocation pending (not written! so `revoked` field is false)
    yield expectAnswer(rp('http://127.0.0.1:9965/wot/lookup/tac', { json: true }), function(res) {
      res.should.have.property('results').length(1);
      res.results[0].should.have.property('uids').length(1);
      res.results[0].uids[0].should.have.property('uid').equal('tac');
      res.results[0].uids[0].should.have.property('revoked').equal(false);
      res.results[0].uids[0].should.have.property('revoked_on').equal(null);
      res.results[0].uids[0].should.have.property('revocation_sig').not.equal(null);
      res.results[0].uids[0].should.have.property('revocation_sig').not.equal('');
    });
  }));

  it('if we commit a revocation, cat should be revoked', () => co(function *() {
    yield commitS1();
    return expectAnswer(rp('http://127.0.0.1:9964/wot/lookup/cat', { json: true }), function(res) {
      res.should.have.property('results').length(1);
      res.results[0].should.have.property('uids').length(1);
      res.results[0].uids[0].should.have.property('uid').equal('cat');
      res.results[0].uids[0].should.have.property('revoked').equal(true);
      res.results[0].uids[0].should.have.property('revoked_on').equal(1);
      res.results[0].uids[0].should.have.property('revocation_sig').not.equal(null);
      res.results[0].uids[0].should.have.property('revocation_sig').not.equal('');
    });
  }));

  it('should have 2 members', function() {
    return expectAnswer(rp('http://127.0.0.1:9964/wot/members', { json: true }), function(res) {
      res.should.have.property('results').length(2);
      _.pluck(res.results, 'uid').sort().should.deepEqual(['tic','toc']);
    });
  });

  it('cat should not be able to join back', () => co(function *() {
    try {
      yield cat.join();
    } catch (e) {
      should.exists(e);
    }
    yield commitS1();
    return expectAnswer(rp('http://127.0.0.1:9964/wot/members', { json: true }), function(res) {
      res.should.have.property('results').length(2);
      _.pluck(res.results, 'uid').sort().should.deepEqual(['tic','toc']);
    });
  }));

  it('if we revert the commit, cat should not be revoked', () => co(function *() {
    yield s1.revert();
    yield s1.revert();
    return expectAnswer(rp('http://127.0.0.1:9964/wot/lookup/cat', { json: true }), function(res) {
      res.should.have.property('results').length(1);
      res.results[0].should.have.property('uids').length(1);
      res.results[0].uids[0].should.have.property('uid').equal('cat');
      res.results[0].uids[0].should.have.property('revoked').equal(false);
      res.results[0].uids[0].should.have.property('revoked_on').equal(null);
      res.results[0].uids[0].should.have.property('revocation_sig').equal(null); // We loose the revocation
      res.results[0].uids[0].should.have.property('revocation_sig').equal(null);
    });
  }));

  it('if we commit again, cat should NOT be revoked (we have lost the revocation)', () => co(function *() {
    yield commitS1();
    return expectAnswer(rp('http://127.0.0.1:9964/wot/lookup/cat', { json: true }), function(res) {
      res.should.have.property('results').length(1);
      res.results[0].should.have.property('uids').length(1);
      res.results[0].uids[0].should.have.property('uid').equal('cat');
      res.results[0].uids[0].should.have.property('revoked').equal(false);
      res.results[0].uids[0].should.have.property('revoked_on').equal(null);
      res.results[0].uids[0].should.have.property('revocation_sig').equal(null); // We loose the revocation
      res.results[0].uids[0].should.have.property('revocation_sig').equal(null);
    });
  }));

});
