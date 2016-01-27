"use strict";
var should = require('should');
var assert = require('assert');
var async  = require('async');
var _      = require('underscore');
var Q      = require('q');
var co     = require('co');
var node   = require('./tools/node');
var user   = require('./tools/user');
var jspckg = require('../../package');

var MEMORY_MODE = true;

describe("Forwarding", function() {

  describe("Nodes", function() {

    var common = { currency: 'bb', ipv4: '127.0.0.1', remoteipv4: '127.0.0.1', upnp: false, participate: false, rootoffset: 0, sigQty: 1 };

    var node1 = node({ name: 'db_1', memory: MEMORY_MODE }, _({ httplogs: false, port: 9600, remoteport: 9600, salt: 'abc', passwd: 'abc', routing: true }).extend(common));
    var node2 = node({ name: 'db_2', memory: MEMORY_MODE }, _({ httplogs: false, port: 9601, remoteport: 9601, salt: 'abc', passwd: 'def', routing: true }).extend(common));

    var cat = user('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, node1);
    var tac = user('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, node1);
    var tic = user('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, node1);
    var toc = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, node1);

    before(function(done) {
      Q.all([node1, node2].map(function(node) {
        return node
          .startTesting();
      }))
        .then(function() {
          return Q.Promise(function(resolve, reject){
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
        })
        .then(function(){
          return Q.all([
            node2.until('identity', 4),
            node2.until('block', 1),
            co(function *() {

              var now = Math.round(new Date().getTime()/1000);

              // Self certifications
              yield cat.selfCert(now);
              yield tac.selfCert(now);
              yield tic.selfCert(now);
              yield toc.selfCert(now);
              // Certifications
              yield cat.certP(tac);
              yield tac.certP(cat);
              yield cat.joinP();
              yield tac.joinP();
              yield node1.commitP();
            })
          ]);
        })
        .then(function(){
          done();
        })
        .catch(function(err){
          done(err);
        })
        .done();
    });

    describe("Testing technical API", function(){

      it('Node1 should be up and running', node1.summary(function(summary, done){
        should.exists(summary);
        should.exists(summary.ucoin);
        should.exists(summary.ucoin.software);
        should.exists(summary.ucoin.version);
        assert.equal(summary.ucoin.software, "ucoind");
        assert.equal(summary.ucoin.version, jspckg.version);
        done();
      }));

      it('Node2 should be up and running', node2.summary(function(summary, done){
        should.exists(summary);
        should.exists(summary.ucoin);
        should.exists(summary.ucoin.software);
        should.exists(summary.ucoin.version);
        assert.equal(summary.ucoin.software, "ucoind");
        assert.equal(summary.ucoin.version, jspckg.version);
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
        should.exists(res);
        assert.equal(res.results.length, 1);
        done();
      }));

      it('should have sent 1 signature', node.lookup('cat', function(res, done){
        should.exists(res);
        assert.equal(res.results[0].signed.length, 1);
        should.exists(res.results[0].signed[0].isMember);
        should.exists(res.results[0].signed[0].wasMember);
        assert.equal(res.results[0].signed[0].isMember, true);
        assert.equal(res.results[0].signed[0].wasMember, true);
        done();
      }));
    });

    describe("user tac", function(){

      it('should give only 1 result', node.lookup('tac', function(res, done){
        should.exists(res);
        assert.equal(res.results.length, 1);
        done();
      }));

      it('should have 1 signature', node.lookup('tac', function(res, done){
        should.exists(res);
        assert.equal(res.results[0].uids[0].others.length, 1);
        done();
      }));

      it('should have sent 1 signature', node.lookup('tac', function(res, done){
        should.exists(res);
        assert.equal(res.results[0].signed.length, 1);
        done();
      }));
    });

    it('toc should give only 1 result', node.lookup('toc', function(res, done){
      should.exists(res);
      assert.equal(res.results.length, 1);
      done();
    }));

    it('tic should give only 1 results', node.lookup('tic', function(res, done){
      should.exists(res);
      assert.equal(res.results.length, 1);
      done();
    }));
  };
}