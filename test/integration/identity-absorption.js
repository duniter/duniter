"use strict";

var _         = require('underscore');
var co        = require('co');
var ucoin     = require('../../index');
var bma       = require('../../app/lib/streams/bma');
var user      = require('./tools/user');
var rp        = require('request-promise');
var httpTest  = require('./tools/http');

var expectAnswer   = httpTest.expectAnswer;

var MEMORY_MODE = true;
var commonConf = {
  ipv4: '127.0.0.1',
  currency: 'bb',
  httpLogs: true,
  forksize: 3,
  xpercent: 0.9,
  msValidity: 10000,
  parcatipate: false, // TODO: to remove when startGeneration will be an explicit call
  sigQty: 1
};

var s1 = ucoin({
  memory: MEMORY_MODE,
  name: 'bb12'
}, _.extend({
  port: '4450',
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  }
}, commonConf));

var s2 = ucoin({
  memory: MEMORY_MODE,
  name: 'bb12'
}, _.extend({
  port: '4451',
  pair: {
    pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV',
    sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'
  }
}, commonConf));

var cat = user('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
var tic = user('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s2 });

describe("Identity absorption", function() {

  before(function() {

    return co(function *() {
      yield s1.initWithDAL().then(bma).then((bmapi) => bmapi.openConnections());
      yield s2.initWithDAL().then(bma).then((bmapi) => bmapi.openConnections());
      yield cat.selfCert();
      yield tic.cert(cat, s1);
    });
  });

  it('cat should exist on server 1', function() {
    return expectAnswer(rp('http://127.0.0.1:4450/wot/lookup/cat', { json: true }), function(res) {
      res.should.have.property('results').length(1);
      res.results[0].should.have.property('uids').length(1);
      res.results[0].uids[0].should.have.property('uid').equal('cat');
    });
  });

  it('cat should exist on server 2', function() {
    return expectAnswer(rp('http://127.0.0.1:4451/wot/lookup/cat', { json: true }), function(res) {
      res.should.have.property('results').length(1);
      res.results[0].should.have.property('uids').length(1);
      res.results[0].uids[0].should.have.property('uid').equal('cat');
    });
  });
});
