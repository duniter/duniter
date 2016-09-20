"use strict";

const co        = require('co');
const should    = require('should');
const es        = require('event-stream');
const keyring   = require('../../app/lib/crypto/keyring');
const blockProver = require('../../app/lib/computation/blockProver');

/***
conf.medianTimeBlocks
conf.rootoffset
conf.cpu

keyring from Key
***/

const intermediateProofs = [];

const prover = blockProver({
  push: (data) => intermediateProofs.push(data)
});

prover.setConfDAL({
    cpu: 1.0 // 80%
  },
  null,
  keyring.Key(
  'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
  '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
));

const now = 1474382274 * 1000;
const MUST_START_WITH_A_ZERO = 48;

describe("Proof-of-work", function() {

  it('should be able to find an easy PoW', () => co(function*() {
    let block = yield prover.prove({
      number: 2
    }, MUST_START_WITH_A_ZERO, now);
    block.hash.should.match(/^0/);
    intermediateProofs.should.have.length(6);
    intermediateProofs[intermediateProofs.length - 2].pow.should.have.property('found').equal(false);
    intermediateProofs[intermediateProofs.length - 1].pow.should.have.property('found').equal(true);
    intermediateProofs[intermediateProofs.length - 1].pow.should.have.property('hash').equal(block.hash);
  }));
});
