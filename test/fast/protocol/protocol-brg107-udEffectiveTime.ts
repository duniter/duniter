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

import {Indexer} from "../../../app/lib/indexer"

const should        = require('should');

describe("Protocol BR_G107 - udReevalTime", function(){

  it('root block good udReevalTime', async () => {
    const conf   = { udReevalTime0: 1500000000 } as any
    const HEAD_1 = null as any
    const HEAD   = { number: 0 } as any
    Indexer.prepareUDTime(HEAD, HEAD_1, conf);
    HEAD.udReevalTime.should.equal(conf.udReevalTime0);
  })

  it('block with medianTime < udReevalTime', async () => {
    const conf   = { dt: 100, dtReeval: 20 } as any
    const HEAD_1 = { number: 59, udReevalTime: 1500000900 } as any
    const HEAD   = { number: 60, medianTime:   1500000899 } as any
    Indexer.prepareUDTime(HEAD, HEAD_1, conf);
    HEAD.udReevalTime.should.equal(HEAD_1.udReevalTime);
  })

  it('block with medianTime == udReevalTime', async () => {
    const conf   = { dt: 100, dtReeval: 20 } as any
    const HEAD_1 = { number: 59, udReevalTime: 1500000900 } as any
    const HEAD   = { number: 60, medianTime:   1500000900 } as any
    Indexer.prepareUDTime(HEAD, HEAD_1, conf);
    HEAD.udReevalTime.should.equal(HEAD_1.udReevalTime + conf.dtReeval);
  })

  it('block with medianTime > udReevalTime', async () => {
    const conf   = { dt: 100, dtReeval: 20 } as any
    const HEAD_1 = { number: 59, udReevalTime: 1500000900 } as any
    const HEAD   = { number: 60, medianTime:   1500000901 } as any
    Indexer.prepareUDTime(HEAD, HEAD_1, conf);
    HEAD.udReevalTime.should.equal(HEAD_1.udReevalTime + conf.dtReeval);
  })

});
