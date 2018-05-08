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
import {BlockDTO} from "../../../app/lib/dto/BlockDTO"

const should    = require('should');
const constants = require('../../../app/lib/constants');

const conf = {
  dt: 30,
  avgGenTime: 5000,
  medianTimeBlocks: 1 // The medianTime always equals previous block's medianTime
};

const now = 1578540000;

let s1:TestingServer

describe("Protocol 0.5 Transaction version", function() {

  before(async () => {

    const res1 = await simpleNodeWith2Users(conf);
    s1 = res1.s1;
    const cat = res1.cat;
    const tac = res1.tac;
    await s1.commit({ time: now });
    await s1.commit({ time: now + 100 });
    await s1.commit({ time: now + 100 });
    await cat.sendP(51, tac);
  })

  after(() => {
    return Promise.all([
      s1.closeCluster()
    ])
  })

  it('should not have a block with v5 transaction, but v3', async () => {
    const block = (await s1.commit({ time: now + 100 })) as BlockDTO
    should.exists(block.transactions[0]);
    block.transactions[0].version.should.equal(constants.TRANSACTION_VERSION);
  })
})
