// Source file from duniter: Crypto-currency software to manage libre currency such as Ğ1
// Copyright (C) 2018  Cedric Moreau <cem.moreau@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

import {NewLogger} from "../../../app/lib/logger"
import {BlockProver} from "../../../app/modules/prover/lib/blockProver"

const should    = require('should');
const logger = NewLogger();

/***
conf.medianTimeBlocks
conf.rootoffset
conf.cpu

keyring from Key
***/

const intermediateProofs:any[] = [];
const NB_CORES_FOR_COMPUTATION = 1 // For simple tests. Can be changed to test multiple cores.

const prover = new BlockProver({
  push: (data:any) => intermediateProofs.push(data),
  conf: {
    nbCores: NB_CORES_FOR_COMPUTATION,
    cpu: 1.0, // 80%,
    pair: {
      pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
      sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
    }
  },
  logger
} as any);

const now = 1474382274 * 1000;
const MUST_START_WITH_A_ZERO = 16;
const MUST_START_WITH_TWO_ZEROS = 32;

describe("Proof-of-work", function() {

  it('should be able to find an easy PoW', async () => {
    let block = await prover.prove({
      issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
      number: 2
    }, MUST_START_WITH_TWO_ZEROS, now);
    block.hash.should.match(/^0/);
    intermediateProofs.length.should.be.greaterThan(0);
    intermediateProofs[intermediateProofs.length - 1].pow.should.have.property('found').equal(true);
    intermediateProofs[intermediateProofs.length - 1].pow.should.have.property('hash').equal(block.hash);
  })

  // Too randomly successing test
  // it('should be able to cancel a proof-of-work on other PoW receival', () => co(function*() {
  //   const now = 1474464489;
  //   const res = await toolbox.simpleNetworkOf2NodesAnd2Users({
  //     powMin: 46
  //   }), s1 = res.s1, s2 = res.s2;
  //   await s1.commit({
  //     time: now // 38 hits to find the proof (known by test)
  //   });
  //   await s2.until('block', 1);
  //   await s1.expectJSON('/blockchain/current', { number: 0 });
  //   await s2.expectJSON('/blockchain/current', { number: 0 });
  //   await s1.commit({
  //     time: now + 13 // 521 hits to find the proof
  //   });
  //   await s2.until('block', 1);
  //   await s1.expectJSON('/blockchain/current', { number: 1 });
  //   await s2.expectJSON('/blockchain/current', { number: 1 });
  //   s1.conf.cpu = 1.0;
  //   s2.conf.cpu = 0.02;
  //   await Promise.all([
  //
  //     // Make a concurrent trial
  //     Promise.all([
  //       co(function*() {
  //         try {
  //           let s2commit = s2.commit({ time: now + 14 }); // 7320 hits to be found: very high, that's good because we need time for s1 to find the proof *before* s2
  //           // A little handicap for s1 which will find the proof almost immediately
  //           setTimeout(() => s1.commit({ time: now + 10 }), 100);
  //           await s2commit;
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
  //   await s1.expectJSON('/blockchain/current', { number: 2 });
  //   await s2.expectJSON('/blockchain/current', { number: 2 });
  //   // Both nodes should receive the same last block from s2
  //   s2.conf.cpu = 1.0;
  //   await [
  //     s1.until('block', 1),
  //     s2.until('block', 1),
  //     s2.commit({ time: now + 10 })
  //   ];
  //   await s1.expectJSON('/blockchain/current', { number: 3 });
  //   await s2.expectJSON('/blockchain/current', { number: 3 });
  // }));

  // TODO: re-enable when algorithm is better
  // it('should be able to cancel a waiting on other PoW receival', () => co(function*() {
  //   const now = 1474464481;
  //   const res = await toolbox.simpleNetworkOf2NodesAnd2Users({
  //     powSecurityRetryDelay: 10 * 60 * 1000,
  //     powMaxHandicap: 8,
  //     percentRot: 1,
  //     powMin: 35
  //   }), s1 = res.s1, s2 = res.s2;
  //   await Promise.all([
  //     s1.commit({ time: now }),
  //     // We wait until both nodes received the new block
  //     s1.until('block', 1),
  //     s2.until('block', 1)
  //   ]);
  //   await s1.expectJSON('/blockchain/current', { number: 0 });
  //   await s2.expectJSON('/blockchain/current', { number: 0 });
  //   await Promise.all([
  //     s2.commit({ time: now }),
  //     // We wait until both nodes received the new block
  //     s1.until('block', 1),
  //     s2.until('block', 1)
  //   ]);
  //   await s1.expectJSON('/blockchain/current', { number: 1 });
  //   await s2.expectJSON('/blockchain/current', { number: 1 });
  //   await Promise.all([
  //     s1.commit({ time: now }),
  //     // We wait until both nodes received the new block
  //     s1.until('block', 1),
  //     s2.until('block', 1)
  //   ]);
  //   await s1.expectJSON('/blockchain/current', { number: 2, issuersCount: 1 });
  //   await s2.expectJSON('/blockchain/current', { number: 2, issuersCount: 1 });
  //   await Promise.all([
  //     s2.commit({ time: now }),
  //     // We wait until both nodes received the new block
  //     s1.until('block', 1),
  //     s2.until('block', 1)
  //   ]);
  //   await s1.expectJSON('/blockchain/current', { number: 3, issuersCount: 2 });
  //   await s2.expectJSON('/blockchain/current', { number: 3, issuersCount: 2 });
  //   // await s2.expectJSON('/blockchain/difficulties', { number: 3, issuersCount: 2 });
  //   await Promise.all([
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
  //   await s1.expectJSON('/blockchain/current', { number: 5 });
  //   await s2.expectJSON('/blockchain/current', { number: 5 });
  // }));
});
