var should = require('should');
var assert = require('assert');
var user   = require('./../tools/user');
var node   = require('./../tools/node');
var async  = require('async');
require('log4js').configure({
   "appenders": [
     //{ category: "db1", type: "console" }
   ]
});

var host = 'localhost';
var port = 9999;
var node1 = node('db1', { currency: 'bb', ipv4: host, port: port, remoteipv4: host, remoteport: port, upnp: false, httplogs: true });
var cat = user('cat', 'abc', 'abc', node1);
var tac = user('tac', 'abc', 'def', node1);
var tic = user('tic', 'abc', 'ghi', node1);
var toc = user('toc', 'abc', 'jkl', node1);

var now = Math.round(new Date().getTime()/1000);

var scenarios = [
  // Self certifications
  cat.selfCert(now),
  tac.selfCert(now),
  tic.selfCert(now),
  tic.selfCert(now + 2),
  tic.selfCert(now + 2),
  tic.selfCert(now + 2),
  tic.selfCert(now + 3),
  toc.selfCert(now),
  // Certifications
  cat.cert(tac)
];

before(function(done) {
  this.timeout(10000);
  node1.before(scenarios)(done);
})
after(node1.after());

describe("Lookup on", function(){

  describe("user cat", function(){

    it('should give only 1 result', node1.lookup('cat', function(res, done){
      should.exists(res);
      assert.equal(res.results.length, 1);
      done();
    }));

    it('should have sent 1 signature', node1.lookup('cat', function(res, done){
      should.exists(res);
      assert.equal(res.results[0].signed.length, 1);
      done();
    }));
  });

  describe("user tac", function(){

    it('should give only 1 result', node1.lookup('tac', function(res, done){
      should.exists(res);
      assert.equal(res.results.length, 1);
      done();
    }));

    it('should have 1 signature', node1.lookup('tac', function(res, done){
      should.exists(res);
      assert.equal(res.results[0].uids[0].others.length, 1);
      done();
    }));

    it('should have sent 0 signature', node1.lookup('tac', function(res, done){
      should.exists(res);
      assert.equal(res.results[0].signed.length, 0);
      done();
    }));
  });

  it('toc should give only 1 result', node1.lookup('toc', function(res, done){
    should.exists(res);
    assert.equal(res.results.length, 1);
    done();
  }));

  it('tic should give only 3 results', node1.lookup('tic', function(res, done){
    should.exists(res);
    assert.equal(res.results.length, 3);
    done();
  }));
});
