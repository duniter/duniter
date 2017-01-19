"use strict";

const _         = require('underscore');
const co        = require('co');
const should    = require('should');
const duniter   = require('../../index');
const bma       = require('duniter-bma').duniter.methods.bma;
const user      = require('./tools/user');
const constants = require('../../app/lib/constants');
const rp        = require('request-promise');
const httpTest  = require('./tools/http');
const commit    = require('./tools/commit');

const expectAnswer   = httpTest.expectAnswer;

const MEMORY_MODE = true;
const commonConf = {
  ipv4: '127.0.0.1',
  currency: 'bb',
  httpLogs: true,
  forksize: 3,
  xpercent: 0.9,
  sigValidity: 1600, // 1600 second of duration
  msValidity: 3600, // 3600 second of duration
  sigQty: 1
};

const s1 = duniter(
  '/bb11',
  MEMORY_MODE,
  _.extend({
  port: '8561',
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  }
}, commonConf));

const cat = user('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
const tac = user('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, { server: s1 });
const toc = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });

describe("Identities kicking", function() {

  before(function() {

    const commitS1 = commit(s1);

    return co(function *() {

      const now = Math.round(new Date().getTime() / 1000);
      yield s1.initWithDAL().then(bma).then((bmapi) => bmapi.openConnections());
      yield cat.createIdentity();
      yield tac.createIdentity();
      yield cat.cert(tac);
      yield tac.cert(cat);
      yield cat.join();
      yield tac.join();
      yield commitS1({
        time: now
      });
      yield commitS1({
        time: now + 2000
      });
      yield commitS1({
        time: now + 2000
      });
      // Update their membership
      yield cat.join();
      yield tac.join();
      // toc joins thereafter
      yield toc.createIdentity();
      yield toc.join();
      yield cat.cert(toc);
      yield tac.cert(toc);
      yield toc.cert(cat);
      yield commitS1({
        time: now + 2000
      });
      yield commitS1({
        time: now + 5000
      });
      yield commitS1({
        time: now + 5000
      });
      yield commitS1({
        time: now + 5000
      });
    });
  });

  /**
   *
   */

  it('membershipExpiresIn should be positive for cat (actualized member)', function() {
    return expectAnswer(rp('http://127.0.0.1:8561/wot/requirements/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', { json: true }), (res) => {
      res.should.have.property('identities').length(1);
      res.identities[0].should.have.property('pubkey').equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
      res.identities[0].should.have.property('uid').equal('cat');
      res.identities[0].should.have.property('expired').equal(false);
      res.identities[0].should.have.property('membershipExpiresIn').equal(1934);
    });
  });

  it('membershipExpiresIn should be positive for toc (member)', function() {
    return expectAnswer(rp('http://127.0.0.1:8561/wot/requirements/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', { json: true }), (res) => {
      res.should.have.property('identities').length(1);
      res.identities[0].should.have.property('pubkey').equal('DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo');
      res.identities[0].should.have.property('uid').equal('toc');
      res.identities[0].should.have.property('expired').equal(false);
      res.identities[0].should.have.property('membershipExpiresIn').equal(1934);
    });
  });

  it('membershipExpiresIn should equal 0 for a kicked member', function() {
    return expectAnswer(rp('http://127.0.0.1:8561/wot/requirements/2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', { json: true }), (res) => {
      res.should.have.property('identities').length(1);
      res.identities[0].should.have.property('pubkey').equal('2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc');
      res.identities[0].should.have.property('uid').equal('tac');
      res.identities[0].should.have.property('expired').equal(false);
      res.identities[0].should.have.property('membershipExpiresIn').equal(0);
    });
  });
});
