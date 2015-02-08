var should = require('should');
var assert = require('assert');
var user   = require('./tools/user');
var node   = require('./tools/node');
var async  = require('async');
require('log4js').configure({
   "appenders": [
     //{ category: "db1", type: "console" }
   ]
});

var host = 'localhost';
var port = 9999;
var node1 = node('db2', { currency: 'bb', ipv4: host, port: port, remoteipv4: host, remoteport: port, upnp: false, httplogs: true,
  salt: 'abc', passwd: 'abc', participate: false, rootoffset: 0,
  sigQty: 1
});

before(function(done) {
  this.timeout(10000);
  node1.start(done);
});

describe("Integration", function() {

  describe.only("Testing malformed documents", function(){

    before(function(done) {
      this.timeout(10000);
      node1.before(require('./scenarios/malformed-documents')(node1))(done);
    });
    after(node1.after());

    it('should not have crashed because of wrong tx', function(){
      assert.equal(true, true);
    });
  });

  describe("Lookup on", function(){

    before(function(done) {
      this.timeout(10000);
      node1.before(require('./scenarios/wot-lookup')(node1))(done);
    });
    after(node1.after());

    describe("user cat", function(){

      it('should give only 1 result', node1.lookup('cat', function(res, done){
        should.exists(res);
        assert.equal(res.results.length, 1);
        done();
      }));

      it('should have sent 1 signature', node1.lookup('cat', function(res, done){
        should.exists(res);
        assert.equal(res.results[0].signed.length, 1);
        should.exists(res.results[0].signed[0].isMember);
        should.exists(res.results[0].signed[0].wasMember);
        assert.equal(res.results[0].signed[0].isMember, false);
        assert.equal(res.results[0].signed[0].wasMember, false);
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

  describe("Testing leavers", function(){

    before(function(done) {
      this.timeout(10000);
      node1.before(require('./scenarios/certifications')(node1))(done);
    });
    after(node1.after());

    it('toc should give only 1 result with 3 certification by others', node1.lookup('toc', function(res, done){
      should.exists(res);
      assert.equal(res.results.length, 1);
      assert.equal(res.results[0].uids[0].others.length, 3);
      done();
    }));

    it('tic should give only 1 results', node1.lookup('tic', function(res, done){
      should.exists(res);
      assert.equal(res.results.length, 1);
      assert.equal(res.results[0].signed.length, 3);
      assert.equal(res.results[0].signed[0].uid, "cat");
      assert.equal(res.results[0].signed[0].isMember, true);
      assert.equal(res.results[0].signed[0].wasMember, true);
      assert.equal(res.results[0].signed[1].uid, "tac");
      assert.equal(res.results[0].signed[1].isMember, true);
      assert.equal(res.results[0].signed[1].wasMember, true);
      assert.equal(res.results[0].signed[2].uid, "toc");
      assert.equal(res.results[0].signed[2].isMember, true);
      assert.equal(res.results[0].signed[2].wasMember, true);
      assert.equal(res.results[0].uids[0].others.length, 3);
      assert.equal(res.results[0].uids[0].others[0].uids.length, 1);
      assert.equal(res.results[0].uids[0].others[0].isMember, true);
      assert.equal(res.results[0].uids[0].others[0].wasMember, true);
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
});
