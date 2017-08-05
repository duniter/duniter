"use strict";

const _         = require('underscore');
const co        = require('co');
const assert    = require('assert');
const should    = require('should');
const duniter   = require('../../index');
const bma       = require('../../app/modules/bma').BmaDependency.duniter.methods.bma;
const user      = require('./tools/user');
const constants = require('../../app/lib/constants');
const toolbox   = require('./tools/toolbox');

const now = 1480000000;

let s1, cat, tac, tic, toc, tuc

describe("Identities kicking by certs", function() {

  before(() => co(function *() {

    s1 = toolbox.server({
      pair: {
        pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
        sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
      },
      dt: 3600,
      ud0: 1200,
      xpercent: 0.9,
      sigValidity: 5, // 5 second of duration
      sigQty: 2
    });

    cat = user('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
    tac = user('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, { server: s1 });
    tic = user('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });
    toc = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });
    tuc = user('tuc', { pub: '3conGDUXdrTGbQPMQQhEC4Ubu1MCAnFrAYvUaewbUhtk', sec: '5ks7qQ8Fpkin7ycXpxQSxxjVhs8VTzpM3vEBMqM7NfC1ZiFJ93uQryDcoM93Mj77T6hDAABdeHZJDFnkDb35bgiU'}, { server: s1 });

    yield s1.initDalBmaConnections();
    yield cat.createIdentity();
    yield tac.createIdentity();
    yield toc.createIdentity();
    yield cat.cert(tac);
    yield cat.cert(toc);
    yield tac.cert(cat);
    yield tac.cert(toc);
    yield toc.cert(cat);
    yield toc.cert(tac);
    yield cat.join();
    yield tac.join();
    yield toc.join();
    yield s1.commit({ time: now });
    yield s1.commit({ time: now + 3 });
    yield s1.commit({ time: now + 5 });
    yield tic.createIdentity();
    yield cat.cert(tic);
    yield tac.cert(tic);
    yield tic.join();
    yield tuc.createIdentity();
    yield s1.commit({ time: now + 8 });
    yield tic.cert(cat);
    yield cat.cert(tuc);
    yield tac.cert(tuc);
    yield tuc.join();
    yield s1.commit({ time: now + 8 });
    yield tuc.cert(cat);
    yield s1.commit({ time: now + 8 });
    yield s1.commit({ time: now + 8 });
    yield s1.commit({ time: now + 8 });
    yield cat.revoke();
    let err;
    try {
      yield s1.commit({ time: now + 8, excluded: ['3conGDUXdrTGbQPMQQhEC4Ubu1MCAnFrAYvUaewbUhtk'] });
    } catch (e) {
      err = e;
    }
    should.exist(err);
    should.deepEqual(JSON.parse(err.error), {
      "ucode": 1002,
      "message": "ruleToBeKickedArePresent"
    });
    yield s1.commit({ time: now + 8 });
  }));

  after(() => {
    return Promise.all([
      s1.closeCluster()
    ])
  })

  it('block#7 should have kicked 2 member', () => s1.expectJSON('/blockchain/block/7', (res) => {
    assert.deepEqual(res.excluded, [
      '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc',
      'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo'
    ]);
  }));

  it('block#8 should have kicked 1 member', () => s1.expectJSON('/blockchain/block/8', (res) => {
    assert.deepEqual(res.excluded, [
      'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd'
    ]);
  }));
});
