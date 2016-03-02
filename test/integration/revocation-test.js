"use strict";

var _         = require('underscore');
var co        = require('co');
var ucoin     = require('./../../index');
var bma       = require('./../../app/lib/streams/bma');
var user      = require('./tools/user');
var rp        = require('request-promise');
var httpTest  = require('./tools/http');
var commit    = require('./tools/commit');

var expectAnswer   = httpTest.expectAnswer;

var MEMORY_MODE = true;
var commonConf = {
  ipv4: '127.0.0.1',
  currency: 'bb',
  httpLogs: true,
  forksize: 3,
  xpercent: 0.9,
  msValidity: 10000,
  parcatipate: false, // TODO: to remove when startGeneration will be an explicit call
  sigQty: 1
};

var s1 = ucoin({
  memory: MEMORY_MODE,
  name: 'bb12'
}, _.extend({
  port: '9964',
  pair: {
    pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo',
    sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'
  }
}, commonConf));

var cat = user('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
var tic = user('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });
var toc = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });

var commitS1 = commit(s1);

describe("Revocation", function() {

  before(function() {

    return co(function *() {
      yield s1.initWithDAL().then(bma).then((bmapi) => bmapi.openConnections());
      yield cat.selfCertPromise();
      yield tic.selfCertPromise();
      yield toc.selfCertPromise();
      yield cat.certPromise(tic);
      yield tic.certPromise(cat);
      yield tic.certPromise(toc);
      yield toc.certPromise(tic);
      yield cat.joinPromise();
      yield tic.joinPromise();
      yield toc.joinPromise();
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
    res.results[0].uids[0].should.have.property('revocation_sig').equal(null);
  }));

  it('sending a revocation for cat should be displayed', () => co(function *() {
    yield cat.revoke();
    return expectAnswer(rp('http://127.0.0.1:9964/wot/lookup/cat', { json: true }), function(res) {
      res.should.have.property('results').length(1);
      res.results[0].should.have.property('uids').length(1);
      res.results[0].uids[0].should.have.property('uid').equal('cat');
      res.results[0].uids[0].should.have.property('revoked').equal(false);
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
      res.results[0].uids[0].should.have.property('revocation_sig').not.equal(null);
      res.results[0].uids[0].should.have.property('revocation_sig').not.equal('');
    });
  }));

  it('if we revert the commit, cat should not be revoked', () => co(function *() {
    yield s1.revert();
    return expectAnswer(rp('http://127.0.0.1:9964/wot/lookup/cat', { json: true }), function(res) {
      res.should.have.property('results').length(1);
      res.results[0].should.have.property('uids').length(1);
      res.results[0].uids[0].should.have.property('uid').equal('cat');
      res.results[0].uids[0].should.have.property('revoked').equal(false);
      res.results[0].uids[0].should.have.property('revocation_sig').not.equal(null);
      res.results[0].uids[0].should.have.property('revocation_sig').not.equal('');
    });
  }));

  it('if we commit again, cat should be revoked', () => co(function *() {
    yield commitS1();
    return expectAnswer(rp('http://127.0.0.1:9964/wot/lookup/cat', { json: true }), function(res) {
      res.should.have.property('results').length(1);
      res.results[0].should.have.property('uids').length(1);
      res.results[0].uids[0].should.have.property('uid').equal('cat');
      res.results[0].uids[0].should.have.property('revoked').equal(true);
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
    yield cat.joinP();
    yield commitS1();
    return expectAnswer(rp('http://127.0.0.1:9964/wot/members', { json: true }), function(res) {
      res.should.have.property('results').length(2);
      _.pluck(res.results, 'uid').sort().should.deepEqual(['tic','toc']);
    });
  }));

});
