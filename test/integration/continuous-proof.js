"use strict";

const co        = require('co');
const es        = require('event-stream');
const should    = require('should');
const TestUser  = require('./tools/TestUser').TestUser
const toolbox   = require('./tools/toolbox');
const constants = require('../../app/lib/constants');

const NB_CORES_FOR_COMPUTATION = 1 // For simple tests. Can be changed to test multiple cores.

let s1, s2, s3, i1, i2

describe("Continous proof-of-work", function() {

  before(() => co(function*() {

    s1 = toolbox.server({
      cpu: 1,
      nbCores: NB_CORES_FOR_COMPUTATION,
      powDelay: 100,
      powMin: 1,
      pair: {
        pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
        sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
      }
    })

    i1 = new TestUser('i1',   { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
    i2 = new TestUser('i2',   { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });

    yield s1.prepareForNetwork();
    yield i1.createIdentity();
    yield i2.createIdentity();
    yield i1.cert(i2);
    yield i2.cert(i1);
    yield i1.join();
    yield i2.join();
    yield s1.commit();
    yield s1.closeCluster();
  }));

  it('should automatically stop waiting if nothing happens', () => co(function*() {
    s1.conf.powSecurityRetryDelay = 10;
    let start = Date.now();
    s1.startBlockComputation();
    // s1.permaProver.should.have.property('loops').equal(0);
    yield s1.until('block', 1);
    // s1.permaProver.should.have.property('loops').equal(1);
    (start - Date.now()).should.be.belowOrEqual(1000);
    yield s1.stopBlockComputation();
    yield new Promise((resolve) => setTimeout(resolve, 100));
    // s1.permaProver.should.have.property('loops').equal(2);
    s1.conf.powSecurityRetryDelay = 10 * 60 * 1000;
    yield s1.revert();
    s1.permaProver.loops = 0;
    yield s1.stopBlockComputation();
  }));

  it('should be able to start generation and find a block', () => co(function*() {
    s1.permaProver.should.have.property('loops').equal(0);
    yield [
      s1.startBlockComputation(),
      s1.until('block', 2)
    ];
    // Should have made:
    // * 1 loop between block 0 and 1 by waiting
    // * 1 loop for making b#1
    // * 1 loop by waiting between b#1 and b#2
    // * 1 loop for making b#2
    yield new Promise((resolve) => setTimeout(resolve, 100));
    // s1.permaProver.should.have.property('loops').equal(4);
    yield s1.stopBlockComputation();

    // If we wait a bit, the loop should be ended
    yield new Promise((resolve) => setTimeout(resolve, 100));
    // s1.permaProver.should.have.property('loops').equal(5);
    yield s1.stopBlockComputation();
  }));

  it('should be able to cancel generation because of a blockchain switch', () => co(function*() {
    // s1.permaProver.should.have.property('loops').equal(5);
    s1.startBlockComputation();
    yield s1.until('block', 1);
    // * 1 loop for making b#3
    yield new Promise((resolve) => setTimeout(resolve, 100));
    // s1.permaProver.should.have.property('loops').equal(6);
    yield s1.permaProver.blockchainChanged();
    yield new Promise((resolve) => setTimeout(resolve, 100));
    // * 1 loop for waiting for b#4 but being interrupted
    s1.permaProver.should.have.property('loops').greaterThanOrEqual(5);
    yield s1.stopBlockComputation();

    // If we wait a bit, the loop should be ended
    yield new Promise((resolve) => setTimeout(resolve, 100));
    s1.permaProver.should.have.property('loops').greaterThanOrEqual(6);
  }));

  it('testing proof-of-work during a block pulling', () => co(function*() {
    const res = yield toolbox.simpleNetworkOf2NodesAnd2Users({
      nbCores: NB_CORES_FOR_COMPUTATION,
      powMin: 0
    }), s2 = res.s1, s3 = res.s2;
    yield s2.commit();
    s2.conf.cpu = 1.0;
    s2.startBlockComputation();
    yield s2.until('block', 15);
    yield s2.stopBlockComputation();
    yield [
      require('../../app/modules/crawler').CrawlerDependency.duniter.methods.pullBlocks(s3),
      new Promise(res => {
        s3.pipe(es.mapSync((e) => {
          if (e.number === 15) {
            res()
          }
          return e
        }))

      }),
      s3.startBlockComputation()
    ];
    const current = yield s3.get('/blockchain/current')
    yield s3.stopBlockComputation();
    current.number.should.be.aboveOrEqual(14)
    yield s1.closeCluster()
  }));
});
