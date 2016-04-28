"use strict";

var _         = require('underscore');
var co        = require('co');
var should    = require('should');
var ucoin     = require('./../../index');
var bma       = require('./../../app/lib/streams/bma');
var user      = require('./tools/user');
var constants = require('../../app/lib/constants');
var rp        = require('request-promise');
var httpTest  = require('./tools/http');
var commit    = require('./tools/commit');

var expectAnswer   = httpTest.expectAnswer;

var MEMORY_MODE = true;
var commonConf = {
  ipv4: '127.0.0.1',
  currency: 'bb',
  xpercent: 0.9,
  sigPeriod: 200, // every 200 seconds
  msValidity: 10000,
  parcatipate: false, // TODO: to remove when startGeneration will be an explicit call
  sigQty: 1
};

var s1 = ucoin({
  memory: MEMORY_MODE,
  name: 'bb11'
}, _.extend({
  port: '9225',
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  }
}, commonConf));

var cat = user('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
var tac = user('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, { server: s1 });
var toc = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });
var tic = user('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });

describe("Certification chainability", function() {

  before(function() {

    var now = Math.round(new Date().getTime() / 1000);

    var commitS1 = commit(s1);

    return co(function *() {
      /**
       * tac <===> cat
       */
      yield s1.initWithDAL().then(bma).then((bmapi) => bmapi.openConnections());
      yield cat.selfCertPromise();
      yield tac.selfCertPromise();
      yield cat.certPromise(tac);
      yield tac.certPromise(cat);
      yield cat.joinPromise();
      yield tac.joinPromise();
      yield commitS1({ now });
      yield commitS1({
        time: now + 395
      });

      // Should not happen on the first commit due to certPeriod
      yield tic.selfCertPromise();
      yield tic.joinPromise();
      yield cat.certPromise(tic);
      yield commitS1({ now });
      yield commitS1({ now });
      // We still are at +195, and the certPeriod must be OVER (or equal to) current time to allow new certs from cat.
      // So if we increment +1
      yield commitS1({
        time: now + 100
      });
      yield commitS1({
        time: now + 400
      });
      yield commitS1({ now });
      // Should be integrated now
      yield commitS1({ now });
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

  it('block 6 should have 0 certs', function() {
    return expectAnswer(rp('http://127.0.0.1:9225/blockchain/block/6', { json: true }), function(res) {
      res.should.have.property('number').equal(6);
      res.should.have.property('certifications').length(0);
    });
  });

  it('block 7 should have 1 certs', function() {
    return expectAnswer(rp('http://127.0.0.1:9225/blockchain/block/7', { json: true }), function(res) {
      res.should.have.property('number').equal(7);
      res.should.have.property('certifications').length(1);
    });
  });
});
