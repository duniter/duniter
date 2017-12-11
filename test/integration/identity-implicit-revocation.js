"use strict";

const _         = require('underscore');
const co        = require('co');
const assert    = require('assert');
const should    = require('should');
const duniter   = require('../../index');
const bma       = require('../../app/modules/bma').BmaDependency.duniter.methods.bma;
const TestUser  = require('./tools/TestUser').TestUser
const constants = require('../../app/lib/constants');
const toolbox   = require('./tools/toolbox');

const now = 1480000000;

let s1, cat, tac, tic

describe("Implicit revocation", function() {

  before(() => co(function *() {

    s1 = toolbox.server({
      pair: {
        pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
        sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
      },
      sigValidity: 100,
      msValidity: 10,
      sigQty: 1,
      medianTimeBlocks: 1
    });

    cat = new TestUser('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
    tac = new TestUser('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, { server: s1 });
    tic = new TestUser('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });

    yield s1.initDalBmaConnections();
    yield cat.createIdentity();
    yield tac.createIdentity();
    yield tic.createIdentity();
    yield cat.cert(tac);
    yield tac.cert(tic);
    yield tic.cert(cat);
    yield cat.join();
    yield tac.join();
    yield tic.join();
    yield s1.commit({ time: now });
    yield s1.commit({ time: now + 8 });
    yield s1.commit({ time: now + 9 });
    yield cat.join();
    yield tac.join();
    yield s1.commit({ time: now + 10 });
    yield s1.commit({ time: now + 10 });
    yield s1.commit({ time: now + 11 });
    yield s1.commit({ time: now + 15 });
    yield s1.commit({ time: now + 15 });
    yield cat.join();
    yield tac.join();
    yield s1.commit({ time: now + 20 });
    yield s1.commit({ time: now + 20 });
  }));

  after(() => {
    return Promise.all([
      s1.closeCluster()
    ])
  })

  it('block#4 should have kicked tic', () => s1.expectThat('/blockchain/block/5', (res) => {
    assert.deepEqual(res.excluded, [
      'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV'
    ]);
  }));

  it('should exist implicit revocation traces', () => co(function*() {
    const ms = yield s1.dal.mindexDAL.getReducedMS('DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV')
    ms.should.have.property('revoked_on').equal(1480000020)
  }));

  it('should answer that tic is revoked on API', () => s1.expectThat('/wot/lookup/tic', (res) => {
    res.should.have.property('results').length(1);
    res.results[0].should.have.property('uids').length(1);
    res.results[0].uids[0].should.have.property('uid').equal('tic');
    res.results[0].uids[0].should.have.property('revoked').equal(true);
    res.results[0].uids[0].should.have.property('revoked_on').equal(1480000020);
    res.results[0].uids[0].should.have.property('revocation_sig').equal(null);
  }));
});
