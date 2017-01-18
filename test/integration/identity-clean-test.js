"use strict";

const _         = require('underscore');
const co        = require('co');
const duniter     = require('../../index');
const bma       = require('duniter-bma').duniter.methods.bma;
const user      = require('./tools/user');
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
  msValidity: 10000,
  sigQty: 1
};

const s1 = duniter(
  '/bb12',
  MEMORY_MODE,
  _.extend({
  port: '7733',
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  }
}, commonConf));

const cat = user('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
const tic = user('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });
const toc = user('cat', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });
const tac = user('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, { server: s1 });

describe("Identities cleaned", function() {

  before(function() {

    const commitS1 = commit(s1);

    return co(function *() {
      yield s1.initWithDAL().then(bma).then((bmapi) => bmapi.openConnections());
      yield cat.createIdentity();
      yield tic.createIdentity();
      yield toc.createIdentity();

      yield expectAnswer(rp('http://127.0.0.1:7733/wot/lookup/cat', { json: true }), function(res) {
        res.should.have.property('results').length(2);
        res.results[0].should.have.property('uids').length(1);
        res.results[0].uids[0].should.have.property('uid').equal('cat'); // This is cat
        res.results[1].uids[0].should.have.property('uid').equal('cat'); // This is toc
      });

      yield cat.cert(tic);
      yield tic.cert(cat);
      yield cat.join();
      yield tic.join();
      yield commitS1();

      // We have the following WoT (diameter 1):

      /**
       *  cat <-> tic
       */
    });
  });

  it('should have 2 members', function() {
    return expectAnswer(rp('http://127.0.0.1:7733/wot/members', { json: true }), function(res) {
      res.should.have.property('results').length(2);
      _.pluck(res.results, 'uid').sort().should.deepEqual(['cat', 'tic']);
    });
  });

  it('lookup should give only 1 cat', function() {
    return expectAnswer(rp('http://127.0.0.1:7733/wot/lookup/cat', { json: true }), function(res) {
      res.should.have.property('results').length(1);
      res.results[0].should.have.property('uids').length(1);
      res.results[0].uids[0].should.have.property('uid').equal('cat');
    });
  });

  it('lookup should give only 1 tic', function() {
    return expectAnswer(rp('http://127.0.0.1:7733/wot/lookup/tic', { json: true }), function(res) {
      res.should.have.property('results').length(1);
      res.results[0].should.have.property('uids').length(1);
      res.results[0].uids[0].should.have.property('uid').equal('tic');
    });
  });
});
