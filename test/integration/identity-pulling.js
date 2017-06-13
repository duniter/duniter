"use strict";

const _ = require('underscore');
const co        = require('co');
const assert    = require('assert');
const user      = require('./tools/user');
const commit    = require('./tools/commit');
const toolbox   = require('./tools/toolbox');

const s1 = toolbox.server({
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  }
});
const s2 = toolbox.server({
  pair: {
    pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc',
    sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'
  }
});

const cat1 = user('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
const tac1 = user('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, { server: s1 });
const toc2 = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s2 });
const tic2 = user('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s2 });
const tuc2 = user('tuc', { pub: '3conGDUXdrTGbQPMQQhEC4Ubu1MCAnFrAYvUaewbUhtk', sec: '5ks7qQ8Fpkin7ycXpxQSxxjVhs8VTzpM3vEBMqM7NfC1ZiFJ93uQryDcoM93Mj77T6hDAABdeHZJDFnkDb35bgiU'}, { server: s2 });

describe("Identity pulling", function() {

  before(() => co(function*() {

    yield s1.prepareForNetwork();
    yield s2.prepareForNetwork();

    // Publishing identities
    yield cat1.createIdentity();
    yield tac1.createIdentity();
    yield cat1.cert(tac1);
    yield tac1.cert(cat1);
    yield cat1.join();
    yield tac1.join();
  }));

  it('toc, tic and tuc can create their account on s2', () => co(function*() {
    yield toc2.createIdentity();
    yield tic2.createIdentity();
    yield tuc2.createIdentity();
    yield toc2.join();
    yield tic2.join();
    yield tuc2.join();
    // 2 certs for toc
    yield cat1.cert(toc2, s2, s2);
    yield tac1.cert(toc2, s2, s2);
    // 1 certs for tic
    yield cat1.cert(tic2, s2, s2);
    // 0 certs for tuc
  }));

  it('toc should not be known of s1', () => co(function*() {
    yield s1.expectError('/wot/lookup/toc', 404)
  }));

  it('tic should not be known of s1', () => co(function*() {
    yield s1.expectError('/wot/lookup/tic', 404)
  }));

  it('tuc should not be known of s1', () => co(function*() {
    yield s1.expectError('/wot/lookup/tuc', 404)
  }));

  it('toc should have 2 certs on server2', () => co(function*() {
    yield s2.expectThat('/wot/requirements-of-pending/2', (json) => {
      assert.equal(json.identities.length, 1)
      assert.equal(json.identities[0].pubkey, 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo')
      assert.equal(json.identities[0].uid, 'toc')
      assert.equal(json.identities[0].pendingCerts.length, 2)
      assert.equal(json.identities[0].pendingMemberships.length, 1)
    })
  }));

  it('tic should have 1 certs on server2', () => co(function*() {
    yield s2.expectThat('/wot/requirements-of-pending/1', (json) => {
      assert.equal(json.identities.length, 2)

      assert.equal(json.identities[1].pubkey, 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV')
      assert.equal(json.identities[1].uid, 'tic')
      assert.equal(json.identities[1].pendingCerts.length, 1)
      assert.equal(json.identities[1].pendingMemberships.length, 1)

      assert.equal(json.identities[0].pubkey, 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo')
      assert.equal(json.identities[0].uid, 'toc')
      assert.equal(json.identities[0].pendingCerts.length, 2)
      assert.equal(json.identities[0].pendingMemberships.length, 1)
    })
  }));

  it('s1 should be able to pull sandbox data from s2', () => co(function*() {

    yield s2.sharePeeringWith(s1)
    const pullSandbox = require('duniter-crawler').duniter.methods.pullSandbox
    yield pullSandbox(s1)
    yield pullSandbox(s1)

    yield s1.expectThat('/wot/requirements-of-pending/1', (json) => {

      json.identities = _.sortBy(json.identities, 'pubkey')
      assert.equal(json.identities.length, 4)

      assert.equal(json.identities[3].pubkey, 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd')
      assert.equal(json.identities[3].uid, 'cat')
      assert.equal(json.identities[3].pendingCerts.length, 1)
      assert.equal(json.identities[3].pendingMemberships.length, 1)

      assert.equal(json.identities[0].pubkey, '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc')
      assert.equal(json.identities[0].uid, 'tac')
      assert.equal(json.identities[0].pendingCerts.length, 1)
      assert.equal(json.identities[0].pendingMemberships.length, 1)

      assert.equal(json.identities[2].pubkey, 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV')
      assert.equal(json.identities[2].uid, 'tic')
      assert.equal(json.identities[2].pendingCerts.length, 1)
      assert.equal(json.identities[2].pendingMemberships.length, 1)

      assert.equal(json.identities[1].pubkey, 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo')
      assert.equal(json.identities[1].uid, 'toc')
      assert.equal(json.identities[1].pendingCerts.length, 2)
      assert.equal(json.identities[1].pendingMemberships.length, 1)
    })
  }));

});
