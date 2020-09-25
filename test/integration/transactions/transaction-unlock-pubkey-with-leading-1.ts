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
import { CommonConstants } from "../../../app/lib/common-libs/constants";

const should = require('should');
const assert = require('assert');

const now = 1480000000;

const conf = {
  dt: 10,
  ud0: 200,
  udTime0: now - 1, // So we have a UD right on block#1
  medianTimeBlocks: 1 // Easy: medianTime(b) = time(b-1)
};

let s1:TestingServer, cat:TestUser, tac:TestUser

describe("Transactions unlock with leading 1", () => {

    before(async () => {
        const res = await simpleNodeWith2Users(conf);
        s1 = res.s1;
        cat = res.cat;
        tac = res.tac;
        CommonConstants.BLOCK_GENESIS_VERSION = 13;
        await s1.commit({ time: now });
        await s1.commit({ time: now + 1 });
    })

    after(() => {
        //CommonConstants.DUBP_NEXT_VERSION = 10
        CommonConstants.BLOCK_GENESIS_VERSION = 10;
        return Promise.all([
            s1.closeCluster()
        ])
    })

    it('it should exist block#1 with UD of 200', () => s1.expect('/blockchain/block/1', (block:any) => {
        should.exists(block);
        assert.equal(block.number, 1);
        assert.equal(block.dividend, 200);
    }));

    it('Send money to pubkey with leading 1 and consume without leading 1', async () => {
        let tx1 = await cat.prepareITX(200, "1XoFs76G4yidvVY3FZBwYyLXTMjabryhFD8mNQPkQKHk");
        await shouldNotFail(cat.sendTX(tx1));
        await s1.commit({ time: now + 4 });
        let current = await s1.get('/blockchain/current');
        // Try to consume money without leading 1
        const pub43Keyring = { pub: 'XoFs76G4yidvVY3FZBwYyLXTMjabryhFD8mNQPkQKHk', sec: '2ZuLaTHpkMkUcUJCGrAYBLHffEFCtUkNbq5UYeBQUkX9suoQzt5zcxZ6Q4B21LcHnDRUVUsu1hyfa9EzKrHFmSqx'};
        const pub43 = new TestUser('pub43', pub43Keyring, { server: s1 });
        let tx2 = await pub43.prepareUTX(tx1, ['SIG(0)'], [{ qty: 200, base: 0, lock: 'SIG(' + cat.pub + ')' }], {
            blockstamp: [current.number, current.hash].join('-')
        });
        await shouldNotFail(pub43.sendTX(tx2));
        await s1.commit({ time: now + 5 });
        let tx3 = await cat.prepareITX(200, tac);
        await shouldNotFail(cat.sendTX(tx3));
        await s1.commit({ time: now + 15 });
    });
})
