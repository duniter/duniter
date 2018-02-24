// Source file from duniter: Crypto-currency software to manage libre currency such as Ğ1
// Copyright (C) 2018  Cedric Moreau <cem.moreau@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

"use strict";

const _         = require('underscore');
const co        = require('co');
const should    = require('should');
const duniter   = require('../../index');
const bma       = require('../../app/modules/bma').BmaDependency.duniter.methods.bma;
const TestUser  = require('./tools/TestUser').TestUser
const rp        = require('request-promise');
const httpTest  = require('./tools/http');
const commit    = require('./tools/commit');
const shutDownEngine  = require('./tools/shutDownEngine');

const expectAnswer  = httpTest.expectAnswer;

require('../../app/modules/bma').BmaDependency.duniter.methods.noLimit(); // Disables the HTTP limiter

const MEMORY_MODE = true;
const commonConf = {
  ipv4: '127.0.0.1',
  currency: 'bb',
  httpLogs: true,
  forksize: 3,
  xpercent: 0.9,
  msValidity: 10000,
  sigQty: 1,
  avgGenTime: 300
};

let s1, s2, cat, tic, toc, tacOnS1, tacOnS2

const commitS1 = (opts) => commit(s1)(opts)

describe("Revocation", function() {

  before(function() {

    return co(function *() {

      s1 = duniter(
        '/bb12',
        MEMORY_MODE,
        _.extend({
          port: '9964',
          pair: {
            pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo',
            sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'
          }
        }, commonConf));

      s2 = duniter(
        '/bb13',
        MEMORY_MODE,
        _.extend({
          port: '9965',
          pair: {
            pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
            sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
          }
        }, commonConf));

      cat = new TestUser('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
      tic = new TestUser('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });
      toc = new TestUser('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });
      tacOnS1 = new TestUser('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, { server: s1 });
      tacOnS2 = new TestUser('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, { server: s2 });

      const now = 1400000000
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
      yield commitS1({ time: now });

      // We have the following WoT:
      /**
       *  cat <-> tic <-> toc
       */
    });
  });

  after(() => {
    return Promise.all([
      shutDownEngine(s1),
      shutDownEngine(s2)
    ])
  })

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
    yield commitS1({ revoked: [], excluded: [] });
    yield commitS1();
    return expectAnswer(rp('http://127.0.0.1:9964/wot/lookup/cat', { json: true }), function(res) {
      res.should.have.property('results').length(1);
      res.results[0].should.have.property('uids').length(1);
      res.results[0].uids[0].should.have.property('uid').equal('cat');
      res.results[0].uids[0].should.have.property('revoked').equal(true);
      res.results[0].uids[0].should.have.property('revoked_on').equal(2);
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
    yield s1.dal.blockDAL.exec('DELETE FROM block WHERE fork AND number >= 2')
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
