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

import {NewTestingServer, TestingServer} from "../tools/toolbox"
import {TestUser} from "../tools/TestUser"
import {CommonConstants} from "../../../app/lib/common-libs/constants"
import {BlockDTO} from "../../../app/lib/dto/BlockDTO"
import {HttpBranches} from "../../../app/modules/bma/lib/dtos"

const assert    = require('assert');

const now = 1500000000
const forksize = 10

let s1:TestingServer, s2:TestingServer, s3:TestingServer, cat1:TestUser, tac1:TestUser, toc1:TestUser

describe("Fork blocks", function() {

  before(async () => {

    s1 = NewTestingServer({

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

    s2 = NewTestingServer({

      // Particular conf
      nbCores:1,
      switchOnHeadAdvance: 5,
      forksize,

      pair: {
        pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc',
        sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'
      }
    });

    s3 = NewTestingServer({

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

    await s1.prepareForNetwork();
    await s2.prepareForNetwork();
    await s3.prepareForNetwork();

    // Publishing identities
    await cat1.createIdentity();
    await tac1.createIdentity();
    await toc1.createIdentity();
    await cat1.cert(tac1);
    await tac1.cert(cat1);
    await tac1.cert(toc1);
    await cat1.join();
    await tac1.join();
    await toc1.join();
  })

  after(() => {
    return Promise.all([
      s1.closeCluster(),
      s2.closeCluster(),
      s3.closeCluster()
    ])
  })

  it('should create a common blockchain', async () => {
    const b0 = await s1.commit({ time: now })
    const b1 = await s1.commit({ time: now + 11 })
    const b2 = await s1.commit({ time: now + 22 })
    await s2.writeBlock(b0)
    await s2.writeBlock(b1)
    await s2.writeBlock(b2)
    await s3.writeBlock(b0)
    await s3.writeBlock(b1)
    await s3.writeBlock(b2)
    await s2.waitToHaveBlock(2)
    await s3.waitToHaveBlock(2)
  })

  it('should exist the same block on each node', async () => {
    await s1.expectJSON('/blockchain/current', {
      number: 2
    })
    await s2.expectJSON('/blockchain/current', {
      number: 2
    })
  })

  it('should be able to fork, and notify each node', async () => {
    const b3a = await s1.commit({ time: now + 33 })
    const b3b = await s2.commit({ time: now + 33 })
    await s1.writeBlock(b3b)
    await s2.writeBlock(b3a)
    await s1.waitToHaveBlock(3)
    await s2.waitToHaveBlock(3)
  })

  it('should exist a different third block on each node', async () => {
    await s1.expectJSON('/blockchain/current', {
      number: 3,
      hash: "2C0451EA29CA759AE8296D0751989067AEEC35050BC8CD5623B05C0665C24471"
    })
    await s2.expectJSON('/blockchain/current', {
      number: 3,
      hash: "33038E3E9C1BFB8328234CDD42D1F47B8D362A78161B03E43732CA7432D10A76"
    })
  })

  it('should exist both branches on each node', async () => {
    await s1.expect('/blockchain/branches', (res:HttpBranches) => {
      assert.equal(res.blocks.length, 2)
      assert.equal(res.blocks[0].number, 3)
      assert.equal(res.blocks[0].hash, '33038E3E9C1BFB8328234CDD42D1F47B8D362A78161B03E43732CA7432D10A76')
      assert.equal(res.blocks[1].number, 3)
      assert.equal(res.blocks[1].hash, '2C0451EA29CA759AE8296D0751989067AEEC35050BC8CD5623B05C0665C24471')
    })
    await s2.expect('/blockchain/branches', (res:HttpBranches) => {
      assert.equal(res.blocks.length, 2)
      assert.equal(res.blocks[0].number, 3)
      assert.equal(res.blocks[0].hash, '2C0451EA29CA759AE8296D0751989067AEEC35050BC8CD5623B05C0665C24471')
      assert.equal(res.blocks[1].number, 3)
      assert.equal(res.blocks[1].hash, '33038E3E9C1BFB8328234CDD42D1F47B8D362A78161B03E43732CA7432D10A76')
    })
  })

  let b4a:BlockDTO, b5a:BlockDTO, b6a:BlockDTO, b7a:BlockDTO, b8a:BlockDTO

  it('should be able to grow S1\'s blockchain', async () => {
    b4a = (await s1.commit({time: now + 44})) as BlockDTO
    b5a = (await s1.commit({time: now + 55})) as BlockDTO
    b6a = (await s1.commit({time: now + 66})) as BlockDTO
    b7a = (await s1.commit({time: now + 77})) as BlockDTO
    b8a = (await s1.commit({time: now + 88})) as BlockDTO
    await s1.waitToHaveBlock(8)
  })

  it('should refuse known fork blocks', async () => {
    await s1.sharePeeringWith(s2)
    await s2.sharePeeringWith(s1)
    await s2.writeBlock(b4a)
    const b3c = await s3.commit({ time: now + 33 })
    await new Promise((res, rej) => {
      const event = CommonConstants.DocumentError
      s2.on(event, (e:any) => {
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
  })

  it('should be able to make one fork grow enough to make one node switch', async () => {
    await s2.writeBlock(b5a)
    await s2.writeBlock(b6a)
    await s2.writeBlock(b7a)
    await s2.writeBlock(b8a)
    await Promise.all([
      s2.waitToHaveBlock(8),
      s2.waitForkResolution(8)
    ])
  })

  it('should exist a same current block on each node', async () => {
    await s1.expectJSON('/blockchain/current', {
      number: 8,
      hash: "C41F10519A24950C051F3ABBBF71775D9EF836374EF538897DFFF08E7A3F5E50"
    })
    await s2.expectJSON('/blockchain/current', {
      number: 8,
      hash: "C41F10519A24950C051F3ABBBF71775D9EF836374EF538897DFFF08E7A3F5E50"
    })
  })

  it('should exist 2 branches on each node', async () => {
    await s1.expect('/blockchain/branches', (res:HttpBranches) => {
      assert.equal(res.blocks.length, 3)
      assert.equal(res.blocks[0].number, 3)
      assert.equal(res.blocks[0].hash, '33038E3E9C1BFB8328234CDD42D1F47B8D362A78161B03E43732CA7432D10A76') // This is s2 fork!
      assert.equal(res.blocks[1].number, 3)
      assert.equal(res.blocks[1].hash, '7A1982E7746DE1993F8900C2D453A1E7C010B2BDF304DB83BCBF84932CE8A630')
      assert.equal(res.blocks[2].number, 8)
      assert.equal(res.blocks[2].hash, 'C41F10519A24950C051F3ABBBF71775D9EF836374EF538897DFFF08E7A3F5E50')
    })
    await s2.expect('/blockchain/branches', (res:HttpBranches) => {
      assert.equal(res.blocks.length, 3)
      assert.equal(res.blocks[0].number, 3)
      assert.equal(res.blocks[0].hash, '33038E3E9C1BFB8328234CDD42D1F47B8D362A78161B03E43732CA7432D10A76') // This is s2 fork!
      assert.equal(res.blocks[1].number, 3)
      assert.equal(res.blocks[1].hash, '7A1982E7746DE1993F8900C2D453A1E7C010B2BDF304DB83BCBF84932CE8A630')
      assert.equal(res.blocks[2].number, 8)
      assert.equal(res.blocks[2].hash, 'C41F10519A24950C051F3ABBBF71775D9EF836374EF538897DFFF08E7A3F5E50')
    })
  })
})
