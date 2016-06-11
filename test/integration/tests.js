"use strict";

var co = require('co');
var _ = require('underscore');
var should = require('should');
var assert = require('assert');
var bma       = require('../../app/lib/streams/bma');
var constants = require('../../app/lib/constants');
var node   = require('./tools/node');
var ucoin     = require('../../index');
var user   = require('./tools/user');
var jspckg = require('../../package');
var commit    = require('./tools/commit');
var httpTest  = require('./tools/http');
var rp        = require('request-promise');

var expectAnswer   = httpTest.expectAnswer;
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

    var cat = user('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, node1);
    var tac = user('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, node1);
    var tic = user('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, node1);
    var toc = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, node1);

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
        should.exists(summary.duniter);
        should.exists(summary.duniter.software);
        should.exists(summary.duniter.version);
        assert.equal(summary.duniter.software, "duniter");
        assert.equal(summary.duniter.version, jspckg.version);
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

      before(function() {
        return co(function *() {

          // Self certifications
          yield cat.selfCert();
          yield tac.selfCert();
          yield tic.selfCert();
          yield toc.selfCert();
          // Certifications
          yield cat.cert(tac);
        });
      });
      after(node1.after());

      describe("identities collisions", () => {

        it("sending same identity should fail", () => co(function *() {

          // We send again the same
          try {
            yield tic.selfCert();
            throw 'Should have thrown an error';
          } catch (e) {
            JSON.parse(e).ucode.should.equal(constants.ERRORS.ALREADY_UP_TO_DATE.uerr.ucode);
          }
        }));

        it("sending same identity (again) should fail", () => co(function *() {

          // We send again the same
          try {
            yield tic.selfCert();
            throw 'Should have thrown an error';
          } catch (e) {
            JSON.parse(e).ucode.should.equal(constants.ERRORS.ALREADY_UP_TO_DATE.uerr.ucode);
          }
        }));
      });

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

      it('tic should give only 1 result', node1.lookup('tic', function(res, done){
        should.exists(res);
        assert.equal(res.results.length, 1);
        done();
      }));
    });
  });

  describe("Testing leavers", function(){

    var node3 = ucoin({ name: 'db3', memory: MEMORY_MODE }, {
      currency: 'dd', ipv4: 'localhost', port: 9997, remoteipv4: 'localhost', remoteport: 9997, upnp: false, httplogs: false,
      salt: 'abc', passwd: 'abc', participate: false, rootoffset: 0,
      sigQty: 1, sigPeriod: 0
    });

    var cat = user('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: node3 });
    var tac = user('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, { server: node3 });
    var tic = user('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: node3 });
    var toc = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: node3 });

    before(function() {
      return co(function *() {

        yield node3.initWithDAL().then(bma).then((bmapi) => bmapi.openConnections());
        let now = Math.round(new Date().getTime() / 1000);

        // Self certifications
        yield cat.selfCertP();
        yield tac.selfCertP();
        yield tic.selfCertP();
        yield toc.selfCertP();
        yield cat.certP(tac);
        yield cat.certP(tic);
        yield cat.certP(toc);
        yield tac.certP(cat);
        yield tac.certP(tic);
        yield tic.certP(cat);
        yield tic.certP(tac);
        yield toc.certP(cat);
        yield cat.joinP();
        yield tac.joinP();
        yield tic.joinP();
        yield toc.joinP();
        yield commit(node3)({
          time: now
        });
        yield commit(node3)();
        yield toc.leaveP();
        yield commit(node3)();
        yield tac.certP(toc);
        yield tic.certP(toc);
        yield toc.certP(tic); // Should be taken in 1 block
        yield toc.certP(tac); // Should be taken in 1 other block
        yield commit(node3)({
          time: now + 200
        });
        yield commit(node3)({
          time: now + 200
        });
        yield commit(node3)();
      });
    });

    it('toc should give only 1 result with 3 certification by others', () => expectAnswer(rp('http://127.0.0.1:9997/wot/lookup/toc', { json: true }), function(res) {
      should.exists(res);
      assert.equal(res.results.length, 1);
      assert.equal(res.results[0].uids[0].others.length, 3);
    }));

    it('tic should give only 1 results', () => expectAnswer(rp('http://127.0.0.1:9997/wot/lookup/tic', { json: true }), function(res) {
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
    }));

    it('it should exist block#2 with 4 members', () => expectAnswer(rp('http://127.0.0.1:9997/blockchain/block/2', { json: true }), function(block) {
      should.exists(block);
      assert.equal(block.number, 2);
      assert.equal(block.membersCount, 4);
    }));

    blockShouldHaveCerts(0, 8);
    blockShouldHaveCerts(1, 0);
    blockShouldHaveCerts(2, 0);
    blockShouldHaveCerts(3, 1);
    blockShouldHaveCerts(4, 0);
    blockShouldHaveCerts(5, 1);

    function blockShouldHaveCerts(number, certificationsCount) {
      it('it should exist block#' + number + ' with ' + certificationsCount + ' certification', () => expectAnswer(rp('http://127.0.0.1:9997/blockchain/block/' + number, { json: true }), function(block) {
        should.exists(block);
        assert.equal(block.number, number);
        assert.equal(block.certifications.length, certificationsCount);
      }));
    }
  });
});
