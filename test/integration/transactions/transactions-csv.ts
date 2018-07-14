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

import {simpleNodeWith2Users, TestingServer} from "../tools/toolbox"
import {TestUser} from "../tools/TestUser"
import {shouldFail, shouldNotFail} from "../../unit-tools"

const should = require('should');
const assert = require('assert');

const now = 1480000000;

const conf = {
  dt: 1000,
  ud0: 200,
  udTime0: now - 1, // So we have a UD right on block#1
  medianTimeBlocks: 1 // Easy: medianTime(b) = time(b-1)
};

let s1:TestingServer, cat:TestUser, tac:TestUser

describe("Transactions: CSV", () => {

  before(async () => {
    const res = await simpleNodeWith2Users(conf);
    s1 = res.s1;
    cat = res.cat;
    tac = res.tac;
    await s1.commit({ time: now });
    await s1.commit({ time: now + 1 });
  })

  after(() => {
    return Promise.all([
      s1.closeCluster()
    ])
  })

  it('it should exist block#1 with UD of 200', () => s1.expect('/blockchain/block/1', (block:any) => {
    should.exists(block);
    assert.equal(block.number, 1);
    assert.equal(block.dividend, 200);
  }));

  it('with SIG and CSV', async () => {
    let tx1 = await cat.prepareITX(200, tac);
    await shouldNotFail(cat.sendTX(tx1));
    await s1.commit({ time: now + 19 }); // TODO: why not in the same block?
    let current = await s1.get('/blockchain/current');
    let tx2 = await tac.prepareUTX(tx1, ['SIG(0)'], [{ qty: 200, base: 0, lock: 'SIG(' + cat.pub + ') && CSV(20)' }], {
      comment: 'must wait 20 seconds',
      blockstamp: [current.number, current.hash].join('-')
    });
    await shouldNotFail(cat.sendTX(tx2));
    await s1.commit({ time: now + 38 }); // TODO: why not in the same block?
    let tx3 = await cat.prepareITX(200, tac);
    await shouldFail(cat.sendTX(tx3), 'Wrong unlocker in transaction');
    await s1.commit({ time: now + 39 });
    await shouldNotFail(cat.sendTX(tx3)); // Because next block will have medianTime = 39
    await s1.commit({ time: now + 39 });
  })
})
