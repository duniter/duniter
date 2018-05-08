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

import {TestUser} from "../tools/TestUser"
import {NewTestingServer, TestingServer} from "../tools/toolbox"
import {Underscore} from "../../../app/lib/common-libs/underscore"
import {shouldFail, shouldNotFail} from "../../unit-tools"

const should = require('should');
const assert = require('assert');

describe("Testing transactions", function() {

  const now = 1490000000;

  let s1:TestingServer, tic:TestUser, toc:TestUser

  before(async () => {

    s1 = NewTestingServer({
      pair: {
        pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV',
        sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'
      },
      nbCores: 1,
      dt: 7210,
      ud0: 1200,
      udTime0: now + 7210,
      udReevalTime0: now + 7210,
      avgGenTime: 7210,
      medianTimeBlocks: 1
    });

    tic = new TestUser('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });
    toc = new TestUser('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });

    await s1.initDalBmaConnections();
    // Self certifications
    await tic.createIdentity();
    await toc.createIdentity();
    // Certification;
    await tic.cert(toc);
    await toc.cert(tic);
    await tic.join();
    await toc.join();
    await s1.commit({ time: now });
    await s1.commit({
      time: now + 7210
    });
    await s1.commit({
      time: now + 7210
    });
    await tic.sendP(510, toc);
    await s1.expect('/tx/history/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', (res:any) => {
      res.should.have.property('pubkey').equal('DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo');
      res.should.have.property('history').property('pending').length(1);
      res.history.pending[0].should.have.property('received').be.a.Number;
    });
    await s1.commit({
      time: now + 7220
    });
  })

  after(() => {
    return Promise.all([
      s1.closeCluster()
    ])
  })

  describe("Sources", function(){

    it('it should exist block#2 with UD of 1200', () => s1.expect('/blockchain/block/2', (block:any) => {
      should.exists(block);
      assert.equal(block.number, 2);
      assert.equal(block.dividend, 1200);
    }));

    it('tic should be able to send 510 to toc', async () => {
      await s1.expect('/tx/sources/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', (res:any) => {
        should.exists(res);
        assert.equal(res.sources.length, 1);
        assert.equal(res.sources[0].conditions, 'SIG(DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV)')
        const txSrc = (Underscore.findWhere(res.sources, { type: 'T' }) as any)
        assert.equal(txSrc.amount, 690);
      })
      const tx = await s1.get('/tx/hash/B6DCADFB841AC05A902741A8772A70B4086D5AEAB147AD48987DDC3887DD55C8')
      assert.notEqual(tx, null)
      assert.deepEqual(tx, {
        "comment": "",
        "currency": "duniter_unit_test_currency",
        "hash": "B6DCADFB841AC05A902741A8772A70B4086D5AEAB147AD48987DDC3887DD55C8",
        "inputs": [
          "1200:0:D:DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV:2"
        ],
        "issuers": [
          "DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV"
        ],
        "locktime": 0,
        "outputs": [
          "510:0:SIG(DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo)",
          "690:0:SIG(DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV)"
        ],
        "raw": "",
        "signatures": [
          "Wy2tAKp/aFH2hqZJ5qnUFUNEukFbHwaR4v9gZ/aGoySPfXovDwld9W15w8C0ojVYbma9nlU3eLkVqzVBYz3lAw=="
        ],
        "unlocks": [
          "0:SIG(0)"
        ],
        "version": 10,
        "written_block": 3
      })
    })

    it('toc should have 1510 of sources', () => s1.expect('/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', (res:any) => {
      should.exists(res);
      assert.equal(res.sources.length, 2);
      const txRes = (Underscore.findWhere(res.sources, { type: 'T' }) as any)
      const duRes = (Underscore.where(res.sources, { type: 'D' }) as any)
      assert.equal(txRes.type, 'T');
      assert.equal(txRes.amount, 510);
      assert.equal(duRes[0].type, 'D');
      assert.equal(duRes[0].amount, 1200);
    }));

    it('toc should be able to send 800 to tic', async () => {
      let tx1 = await toc.prepareITX(1710, tic);
      await toc.sendTX(tx1);
      await s1.commit({ time: now + 15000 });
      (await s1.get('/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo')).should.have.property('sources').length(0);
    })
  });

  describe("Chaining", function(){

    it('with SIG and XHX', async () => {
      // Current state
      (await s1.get('/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo')).should.have.property('sources').length(0);
      (await s1.get('/tx/sources/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV')).should.have.property('sources').length(2);
      (await s1.get('/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo')).should.have.property('sources').length(0);
      (await s1.get('/tx/sources/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV')).should.have.property('sources').length(2);
      // Make the time go so another UD is available
      await s1.commit({ time: now + 15000 });
      (await s1.get('/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo')).should.have.property('sources').length(1);
      (await s1.get('/tx/sources/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV')).should.have.property('sources').length(3);
      let tx1 = await toc.prepareITX(1200, tic);
      await toc.sendTX(tx1);
      await s1.commit({ time: now + 15000 });
      (await s1.get('/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo')).should.have.property('sources').length(0);
      (await s1.get('/tx/sources/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV')).should.have.property('sources').length(4);
      // Now cat has all the money...
      let current = await s1.get('/blockchain/current');
      let tx2 = await tic.prepareUTX(tx1, ['SIG(2)'], [{ qty: 1200, base: 0, lock: 'SIG(' + toc.pub + ')' }], { comment: 'wrong', blockstamp: [current.number, current.hash].join('-') });
      let tx3 = await tic.prepareUTX(tx1, ['SIG(1)'], [{ qty: 1200, base: 0, lock: 'SIG(' + toc.pub + ')' }], { comment: 'wrong', blockstamp: [current.number, current.hash].join('-') });
      let tx4 = await tic.prepareUTX(tx1, ['SIG(0)'], [{ qty: 1200, base: 0, lock: 'XHX(8AFC8DF633FC158F9DB4864ABED696C1AA0FE5D617A7B5F7AB8DE7CA2EFCD4CB)' }], { comment: 'ok', blockstamp: [current.number, current.hash].join('-') });
      let tx5 = await tic.prepareUTX(tx1, ['XHX(2)'], [{ qty: 1200, base: 0, lock: 'SIG(' + toc.pub + ')' }], { comment: 'wrong', blockstamp: [current.number, current.hash].join('-') });
      let tx6 = await tic.prepareUTX(tx1, ['XHX(4)'], [{ qty: 1200, base: 0, lock: 'SIG(' + toc.pub + ')' }], { comment: 'wrong', blockstamp: [current.number, current.hash].join('-') });
      await shouldFail(toc.sendTX(tx2), 'Wrong unlocker in transaction');
      await shouldFail(toc.sendTX(tx3), 'Wrong unlocker in transaction');
      await shouldNotFail(toc.sendTX(tx4));
      await shouldFail(toc.sendTX(tx5), 'Wrong unlocker in transaction');
      await shouldFail(toc.sendTX(tx6), 'Wrong unlocker in transaction');
      await s1.commit({ time: now + 19840 }); // TX4 commited
      (await s1.get('/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo')).should.have.property('sources').length(0); // The tx was not sent to someone, but with an XHX! So toc has nothing more than before.
      (await s1.get('/tx/sources/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV')).should.have.property('sources').length(3);
      let tx7 = await tic.prepareUTX(tx4, ['XHX(2872767826647264)'], [{ qty: 1200, base: 0, lock: 'SIG(' + toc.pub + ')' }], { comment: 'wrong1', blockstamp: [current.number, current.hash].join('-') });
      let tx8 = await tic.prepareUTX(tx4, ['XHX(1872767826647264)'], [{ qty: 1200, base: 0, lock: 'SIG(' + toc.pub + ')' }], { comment: 'okk', blockstamp: [current.number, current.hash].join('-') }); // tic unlocks the XHX locked amount, and gives it to toc!
      await shouldFail(toc.sendTX(tx7), 'Wrong unlocker in transaction');
      await shouldNotFail(toc.sendTX(tx8));
      await s1.commit({ time: now + 19840 }); // TX8 commited
      (await s1.get('/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo')).should.have.property('sources').length(1); // That's why toc now has 1 more source...
      (await s1.get('/tx/sources/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV')).should.have.property('sources').length(3); // ...and why tic's number of sources hasn't changed
    })

    it('with MULTISIG', async () => {
      (await s1.get('/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo')).should.have.property('sources').length(1);
      (await s1.get('/tx/sources/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV')).should.have.property('sources').length(3);
      let tx1 = await toc.prepareITX(1200, tic);
      await toc.sendTX(tx1);
      await s1.commit({ time: now + 19840 });
      let current = await s1.get('/blockchain/current');
      (await s1.get('/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo')).should.have.property('sources').length(0);
      (await s1.get('/tx/sources/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV')).should.have.property('sources').length(4);
      // The funding transaction that can be reverted by its issuer (tic here) or consumed by toc if he knowns X for H(X)
      let tx2 = await tic.prepareUTX(tx1, ['SIG(0)'], [{ qty: 1200, base: 0, lock: '(XHX(8AFC8DF633FC158F9DB4864ABED696C1AA0FE5D617A7B5F7AB8DE7CA2EFCD4CB) && SIG(' + toc.pub + ')) || (SIG(' + tic.pub + ') && SIG(' + toc.pub + '))'  }], { comment: 'cross1', blockstamp: [current.number, current.hash].join('-') });
      await shouldNotFail(toc.sendTX(tx2));
      await s1.commit({ time: now + 19840 }); // TX2 commited
      (await s1.get('/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo')).should.have.property('sources').length(1); // toc is also present in the target of tx2
      (await s1.get('/tx/sources/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV')).should.have.property('sources').length(4); // As well as tic
      let tx3 = await tic.prepareUTX(tx2, ['XHX(1872767826647264) SIG(0)'], [{ qty: 1200, base: 0, lock: 'SIG(' + toc.pub + ')' }], { comment: 'wrong', blockstamp: [current.number, current.hash].join('-') });
      let tx4 = await toc.prepareUTX(tx2, ['XHX(1872767826647264) SIG(0)'], [{ qty: 1200, base: 0, lock: 'SIG(' + toc.pub + ')' }], { comment: 'ok', blockstamp: [current.number, current.hash].join('-') });
      let tx5 = await tic.prepareMTX(tx2, toc, ['XHX(1872767826647264) SIG(1) SIG(0)'], [{ qty: 1200, base: 0, lock: 'SIG(' + toc.pub + ')' }], { comment: 'multi OK', blockstamp: [current.number, current.hash].join('-') });
      let tx6 = await toc.prepareMTX(tx2, tic, ['XHX(1872767826647264) SIG(1) SIG(0) SIG(0) SIG(0)'], [{ qty: 1200, base: 0, lock: 'SIG(' + toc.pub + ')' }], { comment: 'multi WRONG', blockstamp: [current.number, current.hash].join('-') });
      // nLocktime
      let tx7 = await tic.prepareMTX(tx2, toc, ['XHX(1872767826647264) SIG(1) SIG(0)'], [{ qty: 1200, base: 0, lock: 'SIG(' + toc.pub + ')' }], { comment: 'wrong locktime', locktime: 100, blockstamp: [current.number, current.hash].join('-') });
      await shouldFail(toc.sendTX(tx3), 'Wrong unlocker in transaction');
      await shouldNotFail(toc.sendTX(tx4));
      await shouldNotFail(toc.sendTX(tx5));
      await shouldFail(toc.sendTX(tx6), 'Wrong unlocker in transaction');
      await shouldFail(toc.sendTX(tx7), 'Locktime not elapsed yet');
    })
  })
})
