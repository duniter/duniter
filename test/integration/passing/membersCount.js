var should = require('should');
var assert = require('assert');
var user   = require('./../tools/user');
var node   = require('./../tools/node');
var async  = require('async');
require('log4js').configure({
   "appenders": [
     { category: "db2", type: "console" }
   ]
});

var host = 'localhost';
var port = 9998;
var node1 = node('db2', { currency: 'bb', ipv4: host, port: port, remoteipv4: host, remoteport: port, upnp: false, httplogs: true,
  salt: 'abc', passwd: 'abc', participate: false, rootoffset: 0,
  sigQty: 1
});
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
  toc.selfCert(now),
  // Certifications
  cat.cert(tac),
  cat.cert(tic),
  cat.cert(toc),
  tac.cert(cat),
  tac.cert(tic),
  tic.cert(cat),
  tic.cert(tac),
  toc.cert(cat),
  cat.join(),
  tac.join(),
  tic.join(),
  toc.join(),
  node1.commit(),
  node1.commit(),
  toc.leave(),
  node1.commit(),
  tac.cert(toc),
  tic.cert(toc),
  toc.cert(tic), // Should be taken in 1 block
  toc.cert(tac), // Should be taken in 1 other block
  node1.commit(),
  node1.commit()
];

before(function(done) {

  // Preparation should not take more than 10 seconds
  this.timeout(20*1000);
  node1.before(scenarios)(done);
})
after(node1.after());

describe.only("Testing leavers", function(){

  it('toc should give only 1 result with 3 certification by others', node1.lookup('toc', function(res, done){
    should.exists(res);
    assert.equal(res.results.length, 1);
    assert.equal(res.results[0].uids[0].others.length, 3);
    done();
  }));

  it('tic should give only 1 results', node1.lookup('tic', function(res, done){
    should.exists(res);
    assert.equal(res.results.length, 1);
    done();
  }));

  it('current should exist block#2 with 4 members', node1.block(2, function(block, done){
    should.exists(block);
    assert.equal(block.number, 2);
    assert.equal(block.membersCount, 4);
    done();
  }));

  it('current should exist block#3 with only 1 certification', node1.block(3, function(block, done){
    should.exists(block);
    assert.equal(block.number, 3);
    assert.equal(block.certifications.length, 1);
    done();
  }));

  it('current should exist block#4 with only 1 certification', node1.block(4, function(block, done){
    should.exists(block);
    assert.equal(block.number, 4);
    assert.equal(block.certifications.length, 1);
    done();
  }));
});
