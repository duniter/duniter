"use strict";

const co = require('co')
const should = require('should')
const moment = require('moment')
const winston = require('winston')
const BlockProver = require('../../../app/modules/prover/lib/blockProver').BlockProver

// Mute logger
winston.remove(winston.transports.Console)

describe('PoW block prover', () => {

  let prover

  before(() => {
    prover = new BlockProver({
      conf: {
        nbCores: 1,
        medianTimeBlocks: 20,
        avgGenTime: 5 * 60,
        pair: {
          pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
          sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
        }
      },
      push: () => {},
      logger: winston
    })
  })

  it('should be configurable', () => co(function*(){
    const res1 = yield prover.changeCPU(0.2)
    res1.should.deepEqual({ cpu: 0.2 })
    const res2 = yield prover.changePoWPrefix('34')
    res2.should.deepEqual({ prefix: '34' })
  }));

  it('should be able to make a proof', () => co(function*(){
    const block = {
      number: 35,
      issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd'
    }
    const forcedTime = 1;
    const proof = yield prover.prove(block, 24, forcedTime)
    proof.should.containEql({
      version: 10,
      nonce: 34000000000010,
      number: 35,
      time: 1,
      currency: '',
      issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
      signature: 'iG9XEEIoGvCuFLRXqXIcGKFeK88K/A0J9MfKWAGvkRHtf6+VtMR/VDtPP67UzfnVdJb4QfMqrNsPMH2+7bTTAA==',
      hash: '07573FEA1248562F47B1FA7DABDAF93C93B7328AA528F470B488249D5806F66D',
      parameters: '',
      previousHash: undefined,
      previousIssuer: undefined,
      inner_hash: 'A31455535488AE74B819FD920CA0BDFEFB6E753BDF1EF17E1661A144A0D6B3EB',
      dividend: null,
      identities: [],
      joiners: [],
      actives: [],
      leavers: [],
      revoked: [],
      excluded: [],
      certifications: [],
      transactions: []
    });
  }));

  it('should be able to use a prefix with 6 digits', () => co(function*(){
    const block = {
      number: 1,
      issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd'
    }
    const params = yield prover.changePoWPrefix('123456')
    params.should.deepEqual({ prefix: '123456' })
    const forcedTime = 1;
    const proof = yield prover.prove(block, 1, forcedTime)
    proof.nonce.should.equal(123456000000000000)
    String(proof.nonce).should.have.length(18)
  }));

  it('should be able to stop a proof', () => co(function*(){
    const block = {
      number: 35,
      issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd'
    }
    const forcedTime = 1;
    const proofPromise = prover.prove(block, 70, forcedTime)
    yield new Promise((res) => setTimeout(res, 20))
    yield prover.cancel()
    let err = ''
    try {
      yield proofPromise
    } catch (e) {
      err = e
    } finally {
      if (!err) {
        throw "Should have thrown!"
      }
      err.should.equal('Proof-of-work computation canceled because block received')
    }
  }));
});
