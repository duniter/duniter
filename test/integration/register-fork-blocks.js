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

const _ = require('underscore');
const co        = require('co');
const assert    = require('assert');
const TestUser  = require('./tools/TestUser').TestUser
const commit    = require('./tools/commit');
const toolbox   = require('./tools/toolbox');
const CommonConstants = require('../../app/lib/common-libs/constants').CommonConstants

const now = 1500000000
const forksize = 10

let s1, s2, s3, cat1, tac1, toc1

describe("Fork blocks", function() {

  before(() => co(function*() {

    s1 = toolbox.server({

      // The common conf
      nbCores:1,
      medianTimeBlocks: 1,
      avgGenTime: 11,
      udTime0: now,
      udReevalTime0: now,
      forksize,

      pair: {
        pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
        sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
      }
    });

    s2 = toolbox.server({

      // Particular conf
      nbCores:1,
      switchOnHeadAdvance: 5,
      forksize,

      pair: {
        pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc',
        sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'
      }
    });

    s3 = toolbox.server({

      // Particular conf
      nbCores:1,
      switchOnHeadAdvance: 5,
      forksize,

      pair: {
        pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo',
        sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'
      }
    });

    cat1 = new TestUser('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
    tac1 = new TestUser('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, { server: s1 });
    toc1 = new TestUser('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });

    yield s1.prepareForNetwork();
    yield s2.prepareForNetwork();
    yield s3.prepareForNetwork();

    // Publishing identities
    yield cat1.createIdentity();
    yield tac1.createIdentity();
    yield toc1.createIdentity();
    yield cat1.cert(tac1);
    yield tac1.cert(cat1);
    yield tac1.cert(toc1);
    yield cat1.join();
    yield tac1.join();
    yield toc1.join();
  }));

  after(() => {
    return Promise.all([
      s1.closeCluster(),
      s2.closeCluster(),
      s3.closeCluster()
    ])
  })

  it('should create a common blockchain', () => co(function*() {
    const b0 = yield s1.commit({ time: now })
    const b1 = yield s1.commit({ time: now + 11 })
    const b2 = yield s1.commit({ time: now + 22 })
    yield s2.writeBlock(b0)
    yield s2.writeBlock(b1)
    yield s2.writeBlock(b2)
    yield s3.writeBlock(b0)
    yield s3.writeBlock(b1)
    yield s3.writeBlock(b2)
    yield s2.waitToHaveBlock(2)
    yield s3.waitToHaveBlock(2)
  }))

  it('should exist the same block on each node', () => co(function*() {
    yield s1.expectJSON('/blockchain/current', {
      number: 2
    })
    yield s2.expectJSON('/blockchain/current', {
      number: 2
    })
  }))

  it('should be able to fork, and notify each node', () => co(function*() {
    const b3a = yield s1.commit({ time: now + 33 })
    const b3b = yield s2.commit({ time: now + 33 })
    yield s1.writeBlock(b3b)
    yield s2.writeBlock(b3a)
    yield s1.waitToHaveBlock(3)
    yield s2.waitToHaveBlock(3)
  }))

  it('should exist a different third block on each node', () => co(function*() {
    yield s1.expectJSON('/blockchain/current', {
      number: 3,
      hash: "2C0451EA29CA759AE8296D0751989067AEEC35050BC8CD5623B05C0665C24471"
    })
    yield s2.expectJSON('/blockchain/current', {
      number: 3,
      hash: "33038E3E9C1BFB8328234CDD42D1F47B8D362A78161B03E43732CA7432D10A76"
    })
  }))

  it('should exist both branches on each node', () => co(function*() {
    yield s1.expect('/blockchain/branches', (res) => {
      assert.equal(res.blocks.length, 2)
      assert.equal(res.blocks[0].number, 3)
      assert.equal(res.blocks[0].hash, '33038E3E9C1BFB8328234CDD42D1F47B8D362A78161B03E43732CA7432D10A76')
      assert.equal(res.blocks[1].number, 3)
      assert.equal(res.blocks[1].hash, '2C0451EA29CA759AE8296D0751989067AEEC35050BC8CD5623B05C0665C24471')
    })
    yield s2.expect('/blockchain/branches', (res) => {
      assert.equal(res.blocks.length, 2)
      assert.equal(res.blocks[0].number, 3)
      assert.equal(res.blocks[0].hash, '2C0451EA29CA759AE8296D0751989067AEEC35050BC8CD5623B05C0665C24471')
      assert.equal(res.blocks[1].number, 3)
      assert.equal(res.blocks[1].hash, '33038E3E9C1BFB8328234CDD42D1F47B8D362A78161B03E43732CA7432D10A76')
    })
  }))

  let b4a, b5a, b6a, b7a, b8a

  it('should be able to grow S1\'s blockchain', () => co(function*() {
    b4a = yield s1.commit({time: now + 44})
    b5a = yield s1.commit({time: now + 55})
    b6a = yield s1.commit({time: now + 66})
    b7a = yield s1.commit({time: now + 77})
    b8a = yield s1.commit({time: now + 88})
    yield s1.waitToHaveBlock(8)
  }))

  it('should refuse known fork blocks', () => co(function*() {
    yield s1.sharePeeringWith(s2)
    yield s2.sharePeeringWith(s1)
    yield s2.writeBlock(b4a)
    const b3c = yield s3.commit({ time: now + 33 })
    yield new Promise((res, rej) => {
      const event = CommonConstants.DocumentError
      s2.on(event, (e) => {
        try {
          assert.equal(e, 'Block already known')
          res()
        } catch (e) {
          rej(e)
        }
      })
      // Trigger the third-party fork block writing
      s2.writeBlock(b3c)
    })
  }))

  it('should be able to make one fork grow enough to make one node switch', () => co(function*() {
    yield s2.writeBlock(b5a)
    yield s2.writeBlock(b6a)
    yield s2.writeBlock(b7a)
    yield s2.writeBlock(b8a)
    yield s2.waitToHaveBlock(8)
    yield s2.waitForkResolution(8)
  }))

  it('should exist a same current block on each node', () => co(function*() {
    yield s1.expectJSON('/blockchain/current', {
      number: 8,
      hash: "C41F10519A24950C051F3ABBBF71775D9EF836374EF538897DFFF08E7A3F5E50"
    })
    yield s2.expectJSON('/blockchain/current', {
      number: 8,
      hash: "C41F10519A24950C051F3ABBBF71775D9EF836374EF538897DFFF08E7A3F5E50"
    })
  }))

  it('should exist 2 branches on each node', () => co(function*() {
    yield s1.expect('/blockchain/branches', (res) => {
      assert.equal(res.blocks.length, 3)
      assert.equal(res.blocks[0].number, 3)
      assert.equal(res.blocks[0].hash, '33038E3E9C1BFB8328234CDD42D1F47B8D362A78161B03E43732CA7432D10A76') // This is s2 fork!
      assert.equal(res.blocks[1].number, 3)
      assert.equal(res.blocks[1].hash, '7A1982E7746DE1993F8900C2D453A1E7C010B2BDF304DB83BCBF84932CE8A630')
      assert.equal(res.blocks[2].number, 8)
      assert.equal(res.blocks[2].hash, 'C41F10519A24950C051F3ABBBF71775D9EF836374EF538897DFFF08E7A3F5E50')
    })
    yield s2.expect('/blockchain/branches', (res) => {
      assert.equal(res.blocks.length, 3)
      assert.equal(res.blocks[0].number, 3)
      assert.equal(res.blocks[0].hash, '33038E3E9C1BFB8328234CDD42D1F47B8D362A78161B03E43732CA7432D10A76') // This is s2 fork!
      assert.equal(res.blocks[1].number, 3)
      assert.equal(res.blocks[1].hash, '7A1982E7746DE1993F8900C2D453A1E7C010B2BDF304DB83BCBF84932CE8A630')
      assert.equal(res.blocks[2].number, 8)
      assert.equal(res.blocks[2].hash, 'C41F10519A24950C051F3ABBBF71775D9EF836374EF538897DFFF08E7A3F5E50')
    })
  }))
});
