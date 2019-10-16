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
import {HttpBlock} from "../../../app/modules/bma/lib/dtos"

const should    = require('should');

const now = 1480000000;

const conf = {
  ud0: 1000,
  udTime0: now + 4, // Delay first UD recomputation to +20
  udReevalTime0: now + 12, // Delay first UD recomputation to +20
  c: .0488,
  dt: 2,
  dtReeval: 10, // => create 5 dividends of 200
  medianTimeBlocks: 1 // The medianTime always equals previous block's medianTime
};

let s1:TestingServer, cat:TestUser, tac:TestUser

describe("Protocol 1.0 Dividend Update", function() {

  /*****
   * DESCRIPTION
   * -----------
   *
   * The dividend is computed over 2 main variables:
   *
   *   * main step dividend: this is a theoretical dividend
   *   * effective dividend: this is the real dividend, which is a share of the theoretical one
   */

  before(async () => {

    const res1 = await simpleNodeWith2Users(conf);
    s1 = res1.s1;
    cat = res1.cat; // HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd
    tac = res1.tac; // 2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc
    await s1.commit({ time: now });
    await s1.commit({ time: now + 3 });
    await s1.commit({ time: now + 4 });
    await s1.commit({ time: now + 5 });
    await s1.commit({ time: now + 6 });
    await s1.commit({ time: now + 8 });
    await s1.commit({ time: now + 10 });
    await s1.commit({ time: now + 12 });
    await s1.commit({ time: now + 14 });
    await s1.commit({ time: now + 16 });
  })

  after(() => {
    return Promise.all([
      s1.closeCluster()
    ])
  })

  it('should have block#2 with no UD', () => s1.expectThat('/blockchain/block/2', (json:HttpBlock) => {
    should.not.exist(json.dividend);
  }));

  it('should have block#3 with UD 1000', () => s1.expectThat('/blockchain/block/3', (json:HttpBlock) => {
    (json.dividend as any).should.equal(1000);
  }));

  it('should have block#4 with no UD', () => s1.expectThat('/blockchain/block/4', (json:HttpBlock) => {
    should.not.exist(json.dividend);
  }));

  it('should have block#5 with UD 1000', () => s1.expectThat('/blockchain/block/5', (json:HttpBlock) => {
    (json.dividend as any).should.equal(1000);
  }));

  it('should have block#6 with UD 1000', () => s1.expectThat('/blockchain/block/6', (json:HttpBlock) => {
    (json.dividend as any).should.equal(1000);
  }));

  it('should have block#7 with UD 1000', () => s1.expectThat('/blockchain/block/7', (json:HttpBlock) => {
    (json.dividend as any).should.equal(1000);
  }));

  it('should have block#8 with UD 1000', () => s1.expectThat('/blockchain/block/8', (json:HttpBlock) => {
    (json.dividend as any).should.equal(1000);
  }));

  it('should have block#9 with UD 1000', () => s1.expectThat('/blockchain/block/9', (json:HttpBlock) => {
    (json.dividend as any).should.equal(1000);
  }));
});
