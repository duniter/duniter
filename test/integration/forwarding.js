"use strict";
const should = require('should');
const assert = require('assert');
const async  = require('async');
const _      = require('underscore');
const co     = require('co');
const node   = require('./tools/node');
const user   = require('./tools/user');
const jspckg = require('../../package');
const limiter = require('../../app/lib/system/limiter');

limiter.noLimit();

const MEMORY_MODE = true;

describe("Forwarding", function() {

  describe("Nodes", function() {

    const common = { currency: 'bb', ipv4: '127.0.0.1', remoteipv4: '127.0.0.1', upnp: false, participate: false, rootoffset: 0, sigQty: 1 };

    const node1 = node({ name: 'db_1', memory: MEMORY_MODE }, _({ httplogs: false, port: 9600, remoteport: 9600, salt: 'abc', passwd: 'abc', routing: true }).extend(common));
    const node2 = node({ name: 'db_2', memory: MEMORY_MODE }, _({ httplogs: false, port: 9601, remoteport: 9601, salt: 'abc', passwd: 'def', routing: true }).extend(common));

    const cat = user('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, node1);
    const tac = user('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, node1);
    const tic = user('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, node1);
    const toc = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, node1);

    before(() => co(function*(){
      yield [node1, node2].map((node) => node.startTesting());
      yield new Promise(function(resolve, reject){
        async.waterfall([
          function(next) {
            node2.peering(next);
          },
          function(peer, next) {
            node1.submitPeer(peer, function(err) {
              next(err);
            });
          },
          function(next) {
            node1.peering(next);
          },
          function(peer, next) {
            node2.submitPeer(peer, next);
          }
        ], function(err) {
          err ? reject(err) : resolve();
        });
      });
      yield [
        node2.until('identity', 4),
        node2.until('block', 1),
        co(function *() {

          // Self certifications
          yield cat.createIdentity();
          yield tac.createIdentity();
          yield tic.createIdentity();
          yield toc.createIdentity();
          // Certifications
          yield cat.cert(tac);
          yield tac.cert(cat);
          yield cat.join();
          yield tac.join();
          yield node1.commitP();
        })
      ];
    }));

    describe("Testing technical API", function(){

      it('Node1 should be up and running', node1.summary(function(summary, done){
        should.exists(summary);
        should.exists(summary.duniter);
        should.exists(summary.duniter.software);
        should.exists(summary.duniter.version);
        assert.equal(summary.duniter.software, "duniter");
        assert.equal(summary.duniter.version, jspckg.version);
        done();
      }));

      it('Node2 should be up and running', node2.summary(function(summary, done){
        should.exists(summary);
        should.exists(summary.duniter);
        should.exists(summary.duniter.software);
        should.exists(summary.duniter.version);
        assert.equal(summary.duniter.software, "duniter");
        assert.equal(summary.duniter.version, jspckg.version);
        done();
      }));
    });

    describe('Node 1', doTests(node1));
    describe('Node 2', doTests(node2));

  });
});

function doTests(node) {

  return function(){

    describe("user cat", function(){

      it('should give only 1 result', node.lookup('cat', function(res, done){
        try {
          should.exists(res);
          assert.equal(res.results.length, 1);
          done();
        } catch (e) {
          done(e);
        }
      }));

      it('should have sent 1 signature', node.lookup('cat', function(res, done){
        try {
          should.exists(res);
          assert.equal(res.results[0].signed.length, 1);
          should.exists(res.results[0].signed[0].isMember);
          should.exists(res.results[0].signed[0].wasMember);
          assert.equal(res.results[0].signed[0].isMember, true);
          assert.equal(res.results[0].signed[0].wasMember, true);
          done();
        } catch (e) {
          done(e);
        }
      }));
    });

    describe("user tac", function(){

      it('should give only 1 result', node.lookup('tac', function(res, done){
        try {
          should.exists(res);
          assert.equal(res.results.length, 1);
          done();
        } catch (e) {
          done(e);
        }
      }));

      it('should have 1 signature', node.lookup('tac', function(res, done){
        try {
          should.exists(res);
          assert.equal(res.results[0].uids[0].others.length, 1);
          done();
        } catch (e) {
          done(e);
        }
      }));

      it('should have sent 1 signature', node.lookup('tac', function(res, done){
        try {
          should.exists(res);
          assert.equal(res.results[0].signed.length, 1);
          done();
        } catch (e) {
          done(e);
        }
      }));
    });

    it('toc should give only 1 result', node.lookup('toc', function(res, done){
      should.not.exists(res);
      done();
    }));

    it('tic should give only 1 results', node.lookup('tic', function(res, done){
      should.not.exists(res);
      done();
    }));
  };
}