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
      nonce: 340000000000034,
      number: 35,
      time: 1,
      currency: '',
      issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
      signature: 'E2sL6bFC9yOZSqBlSGYF158gsAXfJlWsHRHy1oVn3e7ZR6e6SXQ5Sq2fm1ex6Wv4BqO3n9qq0OHsxajUxshICg==',
      hash: '03B176DE082DC451235763D4087305BBD01FD6B6C3248C74EF93B0839DFE9A05',
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

  it('should be able to use a prefix maxed at 899', () => co(function*(){
    const block = {
      number: 1,
      issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd'
    }
    const params = yield prover.changePoWPrefix('899')
    params.should.deepEqual({ prefix: '899' })
    const forcedTime = 1;
    const proof = yield prover.prove(block, 1, forcedTime)
    proof.nonce.should.equal(8990000000000001)
    String(proof.nonce).should.have.length(16)
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
