"use strict";

const co        = require('co');
const should    = require('should');
const toolbox   = require('./tools/toolbox');
const constants = require('../../app/lib/constants');
const logger = require('../../app/lib/logger').NewLogger();
const BlockProver = require('../../app/modules/prover/lib/blockProver').BlockProver

/***
conf.medianTimeBlocks
conf.rootoffset
conf.cpu

keyring from Key
***/

const intermediateProofs = [];
const NB_CORES_FOR_COMPUTATION = 2 // For simple tests. Can be changed to test multiple cores.

const prover = new BlockProver({
  push: (data) => intermediateProofs.push(data),
  conf: {
    avgGenTime: 20,//1*60,
    ecoMode: true,
    nbCores: NB_CORES_FOR_COMPUTATION,
    cpu: 0.8, // 80%,
    pair: {
      pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
      sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
    }
  },
  logger
});

const now = 1474382274 * 1000;
const MUST_START_WITH_A_ZERO = 16;
const MUST_START_WITH_TWO_ZEROS = 32;
const MUST_START_WITH_A_ZERO_AND_A_NUMBER = 22

describe("Proof-of-work", function() {

  it('should be able to find an easy PoW', () => co(function*() {
    let block = yield prover.prove({
      issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
      number: 2
    }, MUST_START_WITH_TWO_ZEROS, now);
    block.hash.should.match(/^0/);
    intermediateProofs.length.should.be.greaterThan(0);
    intermediateProofs[intermediateProofs.length - 1].pow.should.have.property('found').equal(true);
    intermediateProofs[intermediateProofs.length - 1].pow.should.have.property('hash').equal(block.hash);
  }));

  it('should be reducing cpu when the PoW is too easy for the cpu', () => co(function*() {
    prover.conf.nbCores = 2
    prover.conf.cpu = 0.9
    prover.conf.nbCores.should.equal(2)
    prover.conf.cpu.should.equal(0.9)
    for(let i=0; i<8; ++i) {
      yield prover.prove({
        issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
        number: i+2,
        now
      }, MUST_START_WITH_A_ZERO_AND_A_NUMBER, now);
    }
    prover.conf.nbCores.should.equal(1)
    prover.conf.cpu.should.be.below(0.9)
  }));
  // Too randomly successing test
  // it('should be able to cancel a proof-of-work on other PoW receival', () => co(function*() {
  //   const now = 1474464489;
  //   const res = yield toolbox.simpleNetworkOf2NodesAnd2Users({
  //     powMin: 46
  //   }), s1 = res.s1, s2 = res.s2;
  //   yield s1.commit({
  //     time: now // 38 hits to find the proof (known by test)
  //   });
  //   yield s2.until('block', 1);
  //   yield s1.expectJSON('/blockchain/current', { number: 0 });
  //   yield s2.expectJSON('/blockchain/current', { number: 0 });
  //   yield s1.commit({
  //     time: now + 13 // 521 hits to find the proof
  //   });
  //   yield s2.until('block', 1);
  //   yield s1.expectJSON('/blockchain/current', { number: 1 });
  //   yield s2.expectJSON('/blockchain/current', { number: 1 });
  //   s1.conf.cpu = 1.0;
  //   s2.conf.cpu = 0.02;
  //   yield Promise.all([
  //
  //     // Make a concurrent trial
  //     Promise.all([
  //       co(function*() {
  //         try {
  //           let s2commit = s2.commit({ time: now + 14 }); // 7320 hits to be found: very high, that's good because we need time for s1 to find the proof *before* s2
  //           // A little handicap for s1 which will find the proof almost immediately
  //           setTimeout(() => s1.commit({ time: now + 10 }), 100);
  //           yield s2commit;
  //           throw 's2 server should not have found the proof before s1';
  //         } catch (e) {
  //           should.exist(e);
  //           e.should.equal('Proof-of-work computation canceled because block received');
  //         }
  //       })
  //     ]),
  //
  //     // We wait until both nodes received the new block
  //     s1.until('block', 1),
  //     s2.until('block', 1)
  //   ]);
  //   yield s1.expectJSON('/blockchain/current', { number: 2 });
  //   yield s2.expectJSON('/blockchain/current', { number: 2 });
  //   // Both nodes should receive the same last block from s2
  //   s2.conf.cpu = 1.0;
  //   yield [
  //     s1.until('block', 1),
  //     s2.until('block', 1),
  //     s2.commit({ time: now + 10 })
  //   ];
  //   yield s1.expectJSON('/blockchain/current', { number: 3 });
  //   yield s2.expectJSON('/blockchain/current', { number: 3 });
  // }));

  // TODO: re-enable when algorithm is better
  // it('should be able to cancel a waiting on other PoW receival', () => co(function*() {
  //   const now = 1474464481;
  //   const res = yield toolbox.simpleNetworkOf2NodesAnd2Users({
  //     powSecurityRetryDelay: 10 * 60 * 1000,
  //     powMaxHandicap: 8,
  //     percentRot: 1,
  //     powMin: 35
  //   }), s1 = res.s1, s2 = res.s2;
  //   yield Promise.all([
  //     s1.commit({ time: now }),
  //     // We wait until both nodes received the new block
  //     s1.until('block', 1),
  //     s2.until('block', 1)
  //   ]);
  //   yield s1.expectJSON('/blockchain/current', { number: 0 });
  //   yield s2.expectJSON('/blockchain/current', { number: 0 });
  //   yield Promise.all([
  //     s2.commit({ time: now }),
  //     // We wait until both nodes received the new block
  //     s1.until('block', 1),
  //     s2.until('block', 1)
  //   ]);
  //   yield s1.expectJSON('/blockchain/current', { number: 1 });
  //   yield s2.expectJSON('/blockchain/current', { number: 1 });
  //   yield Promise.all([
  //     s1.commit({ time: now }),
  //     // We wait until both nodes received the new block
  //     s1.until('block', 1),
  //     s2.until('block', 1)
  //   ]);
  //   yield s1.expectJSON('/blockchain/current', { number: 2, issuersCount: 1 });
  //   yield s2.expectJSON('/blockchain/current', { number: 2, issuersCount: 1 });
  //   yield Promise.all([
  //     s2.commit({ time: now }),
  //     // We wait until both nodes received the new block
  //     s1.until('block', 1),
  //     s2.until('block', 1)
  //   ]);
  //   yield s1.expectJSON('/blockchain/current', { number: 3, issuersCount: 2 });
  //   yield s2.expectJSON('/blockchain/current', { number: 3, issuersCount: 2 });
  //   // yield s2.expectJSON('/blockchain/difficulties', { number: 3, issuersCount: 2 });
  //   yield Promise.all([
  //
  //     new Promise((resolve) => {
  //       s1.startBlockComputation();
  //       s2.startBlockComputation();
  //       resolve();
  //     }),
  //
  //     // We wait until both nodes received the new block
  //     s1.until('block', 2),
  //     s2.until('block', 2)
  //   ]);
  //   yield s1.expectJSON('/blockchain/current', { number: 5 });
  //   yield s2.expectJSON('/blockchain/current', { number: 5 });
  // }));
});
