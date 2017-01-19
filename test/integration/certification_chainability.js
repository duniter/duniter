"use strict";

const _         = require('underscore');
const co        = require('co');
const should    = require('should');
const duniter     = require('../../index');
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
  xpercent: 0.9,
  sigPeriod: 200, // every 200 seconds
  msValidity: 10000,
  sigQty: 1
};

const s1 = duniter(
  '/bb11',
  MEMORY_MODE,
  _.extend({
  port: '9225',
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  }
}, commonConf));

const cat = user('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
const tac = user('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, { server: s1 });
const toc = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });
const tic = user('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });

describe("Certification chainability", function() {

  before(function() {

    const now = 1482220000;

    const commitS1 = commit(s1);

    return co(function *() {
      /**
       * tac <===> cat
       */
      yield s1.initWithDAL().then(bma).then((bmapi) => bmapi.openConnections());
      yield cat.createIdentity();
      yield tac.createIdentity();
      yield cat.cert(tac);
      yield tac.cert(cat);
      yield cat.join();
      yield tac.join();
      yield commitS1({ time: now });
      yield commitS1({
        time: now + 399
      });

      // Should not happen on the first commit due to certPeriod
      yield tic.createIdentity();
      yield tic.join();
      yield cat.cert(tic);
      yield commitS1({ time: now + 199 });
      yield commitS1({ time: now + 199 });
      // We still are at +199, and the certPeriod must be OVER (or equal to) current time to allow new certs from cat.
      // So if we increment +1
      yield commitS1({
        time: now + 300
      });
      yield commitS1({
        time: now + 300
      });
      // Should be integrated now
      yield commitS1({ time: now + 300 });
    });
  });

  it('block 0 should have 2 certs', function() {
    return expectAnswer(rp('http://127.0.0.1:9225/blockchain/block/0', { json: true }), function(res) {
      res.should.have.property('number').equal(0);
      res.should.have.property('certifications').length(2);
    });
  });

  it('block 1 should have 0 certs', function() {
    return expectAnswer(rp('http://127.0.0.1:9225/blockchain/block/1', { json: true }), function(res) {
      res.should.have.property('number').equal(1);
      res.should.have.property('certifications').length(0);
    });
  });

  it('block 2 should have 0 certs', function() {
    return expectAnswer(rp('http://127.0.0.1:9225/blockchain/block/2', { json: true }), function(res) {
      res.should.have.property('number').equal(2);
      res.should.have.property('certifications').length(0);
    });
  });

  it('block 3 should have 0 certs', function() {
    return expectAnswer(rp('http://127.0.0.1:9225/blockchain/block/3', { json: true }), function(res) {
      res.should.have.property('number').equal(3);
      res.should.have.property('certifications').length(0);
    });
  });

  it('block 4 should have 0 certs', function() {
    return expectAnswer(rp('http://127.0.0.1:9225/blockchain/block/4', { json: true }), function(res) {
      res.should.have.property('number').equal(4);
      res.should.have.property('certifications').length(0);
    });
  });

  it('block 5 should have 0 certs', function() {
    return expectAnswer(rp('http://127.0.0.1:9225/blockchain/block/5', { json: true }), function(res) {
      res.should.have.property('number').equal(5);
      res.should.have.property('certifications').length(0);
    });
  });

  it('block 6 should have 1 certs', function() {
    return expectAnswer(rp('http://127.0.0.1:9225/blockchain/block/6', { json: true }), function(res) {
      res.should.have.property('number').equal(6);
      res.should.have.property('certifications').length(1);
    });
  });
});
