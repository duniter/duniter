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

import {NewTestingServer, TestingServer} from "./tools/toolbox"
import {TestUser} from "./tools/TestUser"
import {CommonConstants} from "../../app/lib/common-libs/constants"

const assert    = require('assert');

const now = 1500000000
const forksize = 10

let s1:TestingServer, s2:TestingServer, s3:TestingServer, s4:TestingServer, cat1:TestUser, tac1:TestUser, toc1:TestUser, tic1:TestUser


describe("protocol version jump", function() {

    before(async () => {
  
      CommonConstants.BLOCK_GENESIS_VERSION = 11;
      CommonConstants.DUBP_NEXT_VERSION = 12;
  
      s1 = NewTestingServer({
  
        // The common conf
        nbCores:1,
        medianTimeBlocks: 1,
        udTime0: now,
        udReevalTime0: now,
        forksize,
  
        pair: {
          pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
          sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
        }
      });
  
      s2 = NewTestingServer({
  
        // The common conf
        nbCores:1,
        medianTimeBlocks: 1,
        udTime0: now,
        udReevalTime0: now,
        forksize,
  
        pair: {
          pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc',
          sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'
        }
      });
  
      s3 = NewTestingServer({
  
        // The common conf
        nbCores:1,
        medianTimeBlocks: 1,
        udTime0: now,
        udReevalTime0: now,
        forksize,
  
        pair: {
          pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo',
          sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'
        }
      });

      s4 = NewTestingServer({
  
        // The common conf
        nbCores:1,
        medianTimeBlocks: 1,
        udTime0: now,
        udReevalTime0: now,
        forksize,
  
        pair: {
          pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV',
          sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'
        }
      });
  
      cat1 = new TestUser('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
      tac1 = new TestUser('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, { server: s1 });
      toc1 = new TestUser('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });
      tic1 = new TestUser('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });

      await s1.prepareForNetwork();
      await s2.prepareForNetwork();
      await s3.prepareForNetwork();
      await s4.prepareForNetwork();
  
      // Publishing identities
      await cat1.createIdentity();
      await tac1.createIdentity();
      await toc1.createIdentity();
      await tic1.createIdentity();
      await cat1.cert(tac1);
      await tac1.cert(cat1);
      await tac1.cert(toc1);
      await toc1.cert(tic1);
      await cat1.join();
      await tac1.join();
      await toc1.join();
      await tic1.join();
    })

    it('Blockchain before protocol jump', async () => {
        // Servers s1 and s2 are in old version
        CommonConstants.DUBP_NEXT_VERSION = CommonConstants.BLOCK_GENESIS_VERSION;
        const b0 = await s1.commit({ time: now })
        await s2.writeBlock(b0)
        await s3.writeBlock(b0)
        await s4.writeBlock(b0)

        await s2.waitToHaveBlock(0)
        const b1 = await s2.commit({ time: now + 1 })
        await s1.writeBlock(b1)
        await s3.writeBlock(b1)
        await s4.writeBlock(b1)

        // Servers s3 and s4 are in new version
        CommonConstants.DUBP_NEXT_VERSION = CommonConstants.BLOCK_GENESIS_VERSION + 1;
        await s3.waitToHaveBlock(1)
        const b2 = await s3.commit({ time: now + 2 })
        await s1.writeBlock(b2)
        await s2.writeBlock(b2)
        await s4.writeBlock(b2)

        await s4.waitToHaveBlock(2)
        const b3 = await s4.commit({ time: now + 3 })
        await s1.writeBlock(b3)
        await s2.writeBlock(b3)
        await s3.writeBlock(b3)

        await s1.waitToHaveBlock(3)
        await s2.waitToHaveBlock(3)
        await s3.waitToHaveBlock(3)

        // b0 and b1 should not have 999 pattern in their nonce
        assert.notEqual('999', b0.nonce.toString().substr(-11, 3))
        assert.notEqual('999', b1.nonce.toString().substr(-11, 3))
        // b2 and b3 should have 999 pattern in their nonce
        assert.equal('999', b2.nonce.toString().substr(-11, 3))
        assert.equal('999', b3.nonce.toString().substr(-11, 3))

        // All blocks should have old version
        assert.equal(CommonConstants.BLOCK_GENESIS_VERSION, b0.version)
        assert.equal(CommonConstants.BLOCK_GENESIS_VERSION, b1.version)
        assert.equal(CommonConstants.BLOCK_GENESIS_VERSION, b2.version)
        assert.equal(CommonConstants.BLOCK_GENESIS_VERSION, b3.version)

    })

    it('s1 upgrade should cause protocol version jump', async () => {
        const b4 = await s1.commit({ time: now + 4 })
        await s2.writeBlock(b4)
        await s3.writeBlock(b4)
        await s4.writeBlock(b4)
        await s2.waitToHaveBlock(4)
        await s3.waitToHaveBlock(4)
        await s4.waitToHaveBlock(4)

        // b4 should have 999 pattern in their nonce
        assert.equal('999', b4.nonce.toString().substr(-11, 3))

        // 75% of the issuers of the current frame have the new version,
        // the next block emitted by one of them must perform the protocol version jump.
        const b5 = await s1.commit({ time: now + 5 })
        await s2.writeBlock(b5)
        await s3.writeBlock(b5)
        await s4.writeBlock(b5)
        await s2.waitToHaveBlock(5)
        await s3.waitToHaveBlock(5)
        await s4.waitToHaveBlock(5)

        // b5 should jump to next protocol version
        assert.equal(CommonConstants.DUBP_NEXT_VERSION, b5.version)

        // b5 should not have 999 pattern in their nonce
        assert.notEqual('999', b5.nonce.toString().substr(-11, 3))
    });

    after(() => {
      CommonConstants.BLOCK_GENESIS_VERSION = 10;
      CommonConstants.DUBP_NEXT_VERSION = 11;
      return Promise.all([
        s1.closeCluster(),
        s2.closeCluster(),
        s3.closeCluster(),
        s4.closeCluster()
      ])
    })

});
