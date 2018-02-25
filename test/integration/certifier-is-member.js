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

describe("Certifier must be a member", function() {

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
    yield cat.cert(tac);
    yield tac.cert(cat);
    yield cat.join();
    yield tac.join();
    yield s1.commit({ time: now });
    yield s1.commit({ time: now + 8 });
    yield s1.commit({ time: now + 9 });
  }));

  it('tic should not be able to certify yet', () => co(function*() {
    yield tic.createIdentity();
    yield tic.join();
    yield cat.cert(tic);
    yield toolbox.shouldFail(tic.cert(cat), 'Certifier must be a member')
  }));

  it('block#3 should see tic becoming member', () => co(function*() {
    yield cat.join();
    yield tac.join();
    yield s1.commit({ time: now + 16 });
    yield s1.expectThat('/blockchain/block/3', (res) => {
      res.should.have.property('joiners').length(1);
    })
  }));

  it('tic is now a member, he should be able to certify', () => co(function*() {
    yield tic.cert(cat);
    yield s1.commit({ time: now + 16 });
    yield cat.join();
    yield tac.join();
    yield s1.commit({ time: now + 21 });
  }));

  it('tic should be excluded', () => co(function*() {
    yield s1.commit({ time: now + 21 });
    yield s1.commit({ time: now + 22 });
    yield s1.expectThat('/blockchain/block/7', (res) => {
      res.should.have.property('excluded').length(1);
      res.excluded[0].should.equal('DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV')
    })
  }));

  it('tic should not be able to certify as he is no more a member', () => co(function*() {
    yield toolbox.shouldFail(tic.cert(tac), 'Certifier must be a member')
  }));

  it('tic should be able to certify when he joins back', () => co(function*() {
    yield tic.join();
    yield s1.commit({ time: now + 23 });
    yield tic.cert(tac);
  }));

  after(() => {
    return s1.closeCluster()
  })
});
