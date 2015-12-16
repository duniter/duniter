"use strict";

var _ = require('underscore');
var should = require('should');
var assert = require('assert');
var node   = require('./tools/node');
var jspckg = require('../../package');
var MEMORY_MODE = true;

describe("Integration", function() {

  describe("Node 1", function() {

    var node1 = node('db1', { currency: 'bb', ipv4: 'localhost', port: 9999, remoteipv4: 'localhost', remoteport: 9999, upnp: false, httplogs: false,
      participate: false, rootoffset: 0,
      sigQty: 1,
      pair: {
        pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
        sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
      }
    });

    before(function(done) {
      node1.startTesting()
        .then(function(){
          node1.before([])(done);
        });
    });

    describe("Testing technical API", function(){

      before(function(done) {
        node1.before([])(done);
      });
      after(node1.after());

      it('/node/summary should give package.json version', node1.summary(function(summary, done){
        should.exists(summary);
        should.exists(summary.ucoin);
        should.exists(summary.ucoin.software);
        should.exists(summary.ucoin.version);
        assert.equal(summary.ucoin.software, "ucoind");
        assert.equal(summary.ucoin.version, jspckg.version);
        done();
      }));
    });

    describe("Testing malformed documents", function(){

      before(function(done) {
        node1.before(require('./scenarios/malformed-documents')(node1))(done);
      });
      after(node1.after());

      it('should not have crashed because of wrong tx', function(){
        assert.equal(true, true);
      });
    });

    describe("Lookup on", function(){

      before(function(done) {
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
  });

  describe("Testing transactions", function(){

    var node2 = node({ name: 'db2', memory: MEMORY_MODE }, { currency: 'cc', ipv4: 'localhost', port: 9998, remoteipv4: 'localhost', remoteport: 9998, upnp: false, httplogs: false,
      pair: {
        pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV',
        sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'
      },
      forksize: 3,
      participate: false, rootoffset: 10,
      sigQty: 1, dt: 0, ud0: 120
    });

    before(function(done) {
      node2.startTesting()
        .then(function(){
          node2.before(require('./scenarios/transactions')(node2))(done);
        });
    });
    after(node2.after());

    it('it should exist block#2 with UD of 120', node2.block(2, function(block, done){
      should.exists(block);
      assert.equal(block.number, 2);
      assert.equal(block.dividend, 120);
      done();
    }));

    it('tic should be able to send 51 to toc', node2.sourcesOf('DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', function(res, done){
      should.exists(res);
      assert.equal(res.sources.length, 2);
      var txSrc = _.findWhere(res.sources, { type: 'T' });
      var udSrc = _.findWhere(res.sources, { type: 'D' });
      assert.equal(txSrc.amount, 69);
      assert.equal(udSrc.amount, 120);
      done();
    }));

    it('toc should have 151 of sources', node2.sourcesOf('DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', function(res, done){
      should.exists(res);
      assert.equal(res.sources.length, 3);
      var txRes = _.findWhere(res.sources, { type: 'T' });
      var duRes = _.filter(res.sources, { type: 'D' });
      assert.equal(txRes.type, 'T');
      assert.equal(txRes.amount, 51);
      assert.equal(duRes[0].type, 'D');
      assert.equal(duRes[0].amount, 120);
      assert.equal(duRes[1].type, 'D');
      assert.equal(duRes[1].amount, 120);
      done();
    }));
  });

  describe("Testing leavers", function(){

    var node3 = node({ name: 'db3', memory: MEMORY_MODE }, { currency: 'dd', ipv4: 'localhost', port: 9997, remoteipv4: 'localhost', remoteport: 9997, upnp: false, httplogs: false,
      salt: 'abc', passwd: 'abc', participate: false, rootoffset: 0,
      sigQty: 1
    });

    before(function(done) {
      node3.startTesting()
        .then(function(){
          node3.before(require('./scenarios/certifications')(node3))(done);
        });
    });
    after(node3.after());

    it('toc should give only 1 result with 3 certification by others', node3.lookup('toc', function(res, done){
      should.exists(res);
      assert.equal(res.results.length, 1);
      assert.equal(res.results[0].uids[0].others.length, 3);
      done();
    }));

    it('tic should give only 1 results', node3.lookup('tic', function(res, done){
      should.exists(res);
      var uids = _.pluck(res.results[0].signed, 'uid');
      var uidsShould = ["cat", "tac", "toc"];
      uids.sort();
      uidsShould.sort();
      assert.deepEqual(uids, uidsShould);
      assert.equal(res.results.length, 1);
      assert.equal(res.results[0].signed.length, 3);
      var cat_signed = _.findWhere(res.results[0].signed, { uid: 'cat'});
      var tac_signed = _.findWhere(res.results[0].signed, { uid: 'tac'});
      var toc_signed = _.findWhere(res.results[0].signed, { uid: 'toc'});
      assert.equal(cat_signed.uid, "cat");
      assert.equal(cat_signed.isMember, true);
      assert.equal(cat_signed.wasMember, true);
      assert.equal(tac_signed.uid, "tac");
      assert.equal(tac_signed.isMember, true);
      assert.equal(tac_signed.wasMember, true);
      assert.equal(toc_signed.uid, "toc");
      assert.equal(toc_signed.isMember, true);
      assert.equal(toc_signed.wasMember, true);
      assert.equal(res.results[0].uids[0].others.length, 3);
      assert.equal(res.results[0].uids[0].others[0].uids.length, 1);
      assert.equal(res.results[0].uids[0].others[0].isMember, true);
      assert.equal(res.results[0].uids[0].others[0].wasMember, true);
      done();
    }));

    it('it should exist block#2 with 4 members', node3.block(2, function(block, done){
      should.exists(block);
      assert.equal(block.number, 2);
      assert.equal(block.membersCount, 4);
      done();
    }));

    it('it should exist block#3 with only 1 certification', node3.block(3, function(block, done){
      should.exists(block);
      assert.equal(block.number, 3);
      assert.equal(block.certifications.length, 1);
      done();
    }));

    it('it should exist block#4 with only 1 certification', node3.block(4, function(block, done){
      should.exists(block);
      assert.equal(block.number, 4);
      assert.equal(block.certifications.length, 1);
      done();
    }));
  });
});
