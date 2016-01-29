"use strict";

var co = require('co');
var Q         = require('q');
var _         = require('underscore');
var ucoin     = require('./../../index');
var bma       = require('./../../app/lib/streams/bma');
var user      = require('./tools/user');
var rp        = require('request-promise');
var httpTest  = require('./tools/http');
var commit    = require('./tools/commit');

var expectJSON     = httpTest.expectJSON;
var expectAnswer   = httpTest.expectAnswer;

var MEMORY_MODE = true;
var commonConf = {
  ipv4: '127.0.0.1',
  currency: 'bb',
  httpLogs: true,
  forksize: 3,
  parcatipate: false, // TODO: to remove when startGeneration will be an explicit call
  sigQty: 1
};

var s1 = ucoin({
  memory: MEMORY_MODE,
  name: 'bb6'
}, _.extend({
  port: '7783',
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  }
}, commonConf));

var cat = user('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
var toc = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });
var tic = user('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });
var tuc = user('tuc', { pub: '3conGDUXdrTGbQPMQQhEC4Ubu1MCAnFrAYvUaewbUhtk', sec: '5ks7qQ8Fpkin7ycXpxQSxxjVhs8VTzpM3vEBMqM7NfC1ZiFJ93uQryDcoM93Mj77T6hDAABdeHZJDFnkDb35bgiU'}, { server: s1 });

describe("Pending data", function() {

  before(function() {

    var commitS1 = commit(s1);

    return co(function *() {
      yield s1.initWithServices().then(bma);
      yield cat.selfCertPromise();
      yield toc.selfCertPromise();
      yield toc.certPromise(cat);
      yield cat.certPromise(toc);
      yield cat.joinPromise();
      yield toc.joinPromise();
      yield commitS1();
      yield commitS1();
      yield tic.selfCertPromise();
      yield cat.certPromise(tic);
      yield toc.certPromise(tic);
      yield tuc.selfCertPromise();
      yield tuc.joinPromise();
      yield commitS1();
      yield commitS1();
      yield commitS1();
      yield commitS1();
    });
  });

  describe("Server 1 /blockchain", function() {

    it('/current should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7783/blockchain/current', { json: true }), {
        number: 5
      });
    });

    it('should have forwarded pending identities + ceritifications of tic', function() {
      return expectAnswer(rp('http://127.0.0.1:7783/wot/lookup/tic', { json: true }), function(res) {
        res.should.have.property('results').length(1);
        res.results[0].should.have.property('uids').length(1);
        res.results[0].uids[0].should.have.property('others').length(2);
      });
    });

    it('should have forwarded pending identities + ceritifications of tuc', function() {
      return expectAnswer(rp('http://127.0.0.1:7783/wot/lookup/tuc', { json: true }), function(res) {
        res.should.have.property('results').length(1);
        res.results[0].should.have.property('uids').length(1);
        res.results[0].uids[0].should.have.property('others').length(0);
      });
    });

    it('should have forwarded membership demands', function() {
      return s1.dal.findNewcomers()
        .then(function(mss){
          mss.should.have.length(1);
        });
    });
  });
});
