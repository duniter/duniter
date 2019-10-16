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

import {CommonConstants} from "../../app/lib/common-libs/constants"
import {TestUser} from "./tools/TestUser"
import {TestingServer} from "./tools/toolbox"
import {shouldNotFail} from "../unit-tools"

const should = require('should');
const assert = require('assert');
const toolbox   = require('./tools/toolbox');

describe("Transaction chaining", () => {

  const now = 1519862401; // At this time TX chaining is **allowed**

  let s1:TestingServer, tic:TestUser, toc:TestUser

  before(async () => {

    s1 = toolbox.server({
      pair: {
        pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV',
        sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'
      },
      dt: 3600,
      udTime0: now + 3600,
      ud0: 1200,
      c: 0.1
    });

    tic = new TestUser('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });
    toc = new TestUser('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });

    await s1.initDalBmaConnections();
    await tic.createIdentity();
    await toc.createIdentity();
    await tic.cert(toc);
    await toc.cert(tic);
    await tic.join();
    await toc.join();
    await s1.commit({ time: now });
    await s1.commit({ time: now + 7210 });
    await s1.commit({ time: now + 7210 });
  })

  after(() => {
    return s1.closeCluster()
  })

  describe("Sources", () => {

    it('it should exist block#2 with UD of 1200', () => s1.expect('/blockchain/block/2', (block: { number:number, dividend:number }) => {
      should.exists(block);
      assert.equal(block.number, 2);
      assert.equal(block.dividend, 1200);
    }))
  })

  describe("Chaining", () => {

    it('with SIG and XHX', async () => {
      // Current state
      let current = await s1.get('/blockchain/current');
      (await s1.get('/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo')).should.have.property('sources').length(1);
      let tx1 = await toc.prepareITX(1040, tic); // Rest = 1200 - 1040 = 160
      let tx2 = await toc.prepareUTX(tx1, ['SIG(0)'], [{ qty: 160, base: 0, lock: 'SIG(' + tic.pub + ')' }], {
        comment: 'also take the remaining 160 units',
        blockstamp: [current.number, current.hash].join('-'),
        theseOutputsStart: 1
      });
      const tmp = CommonConstants.TRANSACTION_MAX_TRIES;
      CommonConstants.TRANSACTION_MAX_TRIES = 2;
      await shouldNotFail(toc.sendTX(tx1));
      await shouldNotFail(toc.sendTX(tx2));
      (await s1.get('/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo')).should.have.property('sources').length(1);
      (await s1.get('/tx/sources/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV')).should.have.property('sources').length(1);
      await s1.commit({ time: now + 7210 }); // TX1 + TX2 commited
      (await s1.get('/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo')).should.have.property('sources').length(0);
      (await s1.get('/tx/sources/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV')).should.have.property('sources').length(3); // The UD + 1040 + 160 units sent by toc
      CommonConstants.TRANSACTION_MAX_TRIES = tmp;
    })

    it('should refuse a block with more than 5 chained tx in it', async () => {
      // Current state
      let current = await s1.get('/blockchain/current');
      const blockstamp = [current.number, current.hash].join('-');
      (await s1.get('/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo')).should.have.property('sources').length(0);
      (await s1.get('/tx/sources/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV')).should.have.property('sources').length(3);
      // Ping-pong of 1200 units
      let tx1 = await tic.prepareITX(1200, toc, "PING-PONG TX1");
      let tx2 = await toc.prepareUTX(tx1, ['SIG(0)'], [{ qty: 1200, base: 0, lock: 'SIG(' + tic.pub + ')' }], { blockstamp, comment: "PING-PONG TX2" });
      let tx3 = await tic.prepareUTX(tx2, ['SIG(0)'], [{ qty: 1200, base: 0, lock: 'SIG(' + toc.pub + ')' }], { blockstamp, comment: "PING-PONG TX3" });
      let tx4 = await toc.prepareUTX(tx3, ['SIG(0)'], [{ qty: 1200, base: 0, lock: 'SIG(' + tic.pub + ')' }], { blockstamp, comment: "PING-PONG TX4" });
      let tx5 = await tic.prepareUTX(tx4, ['SIG(0)'], [{ qty: 1200, base: 0, lock: 'SIG(' + toc.pub + ')' }], { blockstamp, comment: "PING-PONG TX5" });
      let tx6 = await toc.prepareUTX(tx5, ['SIG(0)'], [{ qty: 1200, base: 0, lock: 'SIG(' + tic.pub + ')' }], { blockstamp, comment: "PING-PONG TX6" });
      let tx7 = await tic.prepareUTX(tx6, ['SIG(0)'], [{ qty: 1200, base: 0, lock: 'SIG(' + toc.pub + ')' }], { blockstamp, comment: "PING-PONG TX7" });
      const tmp = CommonConstants.TRANSACTION_MAX_TRIES;
      CommonConstants.TRANSACTION_MAX_TRIES = 2;
      await shouldNotFail(toc.sendTX(tx1));
      await shouldNotFail(toc.sendTX(tx2));
      await shouldNotFail(toc.sendTX(tx3));
      await shouldNotFail(toc.sendTX(tx4));
      await shouldNotFail(toc.sendTX(tx5));
      await shouldNotFail(toc.sendTX(tx6));
      await shouldNotFail(toc.sendTX(tx7));
      // Here we allow any chaining in the block's generation, but we control it during the block's submission
      await s1.commitWaitError({ dontCareAboutChaining: true }, 'The maximum transaction chaining length per block is 5')
      CommonConstants.TRANSACTION_MAX_TRIES = tmp;
    })
  });
});
