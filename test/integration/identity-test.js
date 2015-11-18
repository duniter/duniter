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
  httpLogs: true,
  branchesWindowSize: 3,
  parcatipate: false, // TODO: to remove when startGeneration will be an explicit call
  sigQty: 1
};

var s1 = ucoin({
  memory: MEMORY_MODE,
  name: 'bb11'
}, _.extend({
  port: '7799',
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  }
}, commonConf));

var cat = user('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
var toc = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });
var tic = user('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });
var tic2 = user('tic', { pub: '4KEA63RCFF7AXUePPg5Q7JX9RtzXjywai1iKmE7LcoEC', sec: '48vHGE2xkhnC81ChSu7dHaNv8JqnYubyyHRbkmkeAPKNg8Tv2BE7kVi3voh2ZhfVpQhEJLzceufzqpJ2dqnyXNSp'}, { server: s1 });

var now = Math.round(new Date().getTime()/1000);

describe("Identities", function() {

  before(function() {

    var commitS1 = commit(s1);

    return co(function *() {
      yield s1.initWithServices().then(bma);
      yield cat.selfCertPromise(now);
      yield toc.selfCertPromise(now);
      yield tic.selfCertPromise(now);
      yield toc.certPromise(cat);
      yield cat.certPromise(toc);
      yield cat.certPromise(tic);
      yield cat.joinPromise();
      yield toc.joinPromise();
      yield tic.joinPromise();
      yield commitS1();
      try {
        yield tic.selfCertPromise(now + 2);
        throw 'Should have thrown an error for already used pubkey';
      } catch (e) {
        e.should.equal('Pubkey already used in the blockchain');
      }
      try {
        yield tic2.selfCertPromise(now);
        throw 'Should have thrown an error for already used uid';
      } catch (e) {
        e.should.equal('UID already used in the blockchain');
      }
    });
  });

  it('should have 3 identities', function() {
    return expectAnswer(rp('http://127.0.0.1:7799/wot/members', { json: true }), function(res) {
      res.should.have.property('results').length(3);
      _.pluck(res.results, 'uid').sort().should.deepEqual(['cat', 'tic', 'toc']);
    });
  });

  it('should have certifiers-of/cat giving results', function() {
    return expectAnswer(rp('http://127.0.0.1:7799/wot/certifiers-of/cat', { json: true }), function(res) {
      res.should.have.property('pubkey').equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
      res.should.have.property('uid').equal('cat');
      res.should.have.property('isMember').equal(true);
      res.should.have.property('certifications').length(1);
      let certs = res.certifications;
      certs[0].should.have.property('pubkey').equal('DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo');
      certs[0].should.have.property('uid').equal('toc');
      certs[0].should.have.property('isMember').equal(true);
      certs[0].should.have.property('wasMember').equal(true);
      certs[0].should.have.property('cert_time').property('block').be.a.Number;
      certs[0].should.have.property('cert_time').property('medianTime').be.a.Number;
      certs[0].should.have.property('written').property('number').equal(0);
      certs[0].should.have.property('written').property('hash').not.equal('');
      certs[0].should.have.property('signature').not.equal('');
    });
  });

  it('should have certifiers-of/tic giving results', function() {
    return expectAnswer(rp('http://127.0.0.1:7799/wot/certifiers-of/tic', { json: true }), function(res) {
      res.should.have.property('pubkey').equal('DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV');
      res.should.have.property('uid').equal('tic');
      res.should.have.property('isMember').equal(true);
      res.should.have.property('certifications').length(1);
      let certs = res.certifications;
      certs[0].should.have.property('pubkey').equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
      certs[0].should.have.property('uid').equal('cat');
      certs[0].should.have.property('isMember').equal(true);
      certs[0].should.have.property('wasMember').equal(true);
      certs[0].should.have.property('cert_time').property('block').be.a.Number;
      certs[0].should.have.property('cert_time').property('medianTime').be.a.Number;
      certs[0].should.have.property('written').property('number').equal(0);
      certs[0].should.have.property('written').property('hash').not.equal('');
      certs[0].should.have.property('signature').not.equal('');
    });
  });

  it('should have certifiers-of/toc giving results', function() {
    return expectAnswer(rp('http://127.0.0.1:7799/wot/certifiers-of/toc', { json: true }), function(res) {
      res.should.have.property('pubkey').equal('DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo');
      res.should.have.property('uid').equal('toc');
      res.should.have.property('isMember').equal(true);
      res.should.have.property('certifications').length(1);
      let certs = res.certifications;
      certs[0].should.have.property('pubkey').equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
      certs[0].should.have.property('uid').equal('cat');
      certs[0].should.have.property('isMember').equal(true);
      certs[0].should.have.property('wasMember').equal(true);
      certs[0].should.have.property('cert_time').property('block').be.a.Number;
      certs[0].should.have.property('cert_time').property('medianTime').be.a.Number;
      certs[0].should.have.property('written').property('number').equal(0);
      certs[0].should.have.property('written').property('hash').not.equal('');
      certs[0].should.have.property('signature').not.equal('');
    });
  });

  it('should have certified-by/tic giving results', function() {
    return expectAnswer(rp('http://127.0.0.1:7799/wot/certified-by/tic', { json: true }), function(res) {
      res.should.have.property('pubkey').equal('DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV');
      res.should.have.property('uid').equal('tic');
      res.should.have.property('isMember').equal(true);
      res.should.have.property('certifications').length(0);
    });
  });

  it('should have certified-by/cat giving results', function() {
    return expectAnswer(rp('http://127.0.0.1:7799/wot/certified-by/cat', { json: true }), function(res) {
      res.should.have.property('pubkey').equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
      res.should.have.property('uid').equal('cat');
      res.should.have.property('isMember').equal(true);
      res.should.have.property('certifications').length(2);
      let certs = res.certifications;
      certs[0].should.have.property('pubkey').equal('DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo');
      certs[0].should.have.property('uid').equal('toc');
      certs[0].should.have.property('isMember').equal(true);
      certs[0].should.have.property('wasMember').equal(true);
      certs[0].should.have.property('cert_time').property('block').be.a.Number;
      certs[0].should.have.property('cert_time').property('medianTime').be.a.Number;
      certs[0].should.have.property('written').property('number').equal(0);
      certs[0].should.have.property('written').property('hash').not.equal('');
      certs[0].should.have.property('signature').not.equal('');
      certs[1].should.have.property('pubkey').equal('DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV');
      certs[1].should.have.property('uid').equal('tic');
      certs[1].should.have.property('isMember').equal(true);
      certs[1].should.have.property('wasMember').equal(true);
      certs[1].should.have.property('cert_time').property('block').be.a.Number;
      certs[1].should.have.property('cert_time').property('medianTime').be.a.Number;
      certs[0].should.have.property('written').property('number').equal(0);
      certs[0].should.have.property('written').property('hash').not.equal('');
      certs[1].should.have.property('signature').not.equal('');
    });
  });
});
