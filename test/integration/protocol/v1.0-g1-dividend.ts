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

const start = 1488985390; // 2016-03-08 16:03:10 UTC+0
const delayToUD = 1489057200 - start; // Delay to 2016-03-09 12:00:00 UTC+0

const aDay = 3600 * 24;
const _6months = 15778800;

const conf = {
  ud0: 1000,
  udTime0: 1488970800, // 2016-03-08 12:00:00 UTC+0
  udReevalTime0: 1490094000, // 2016-03-21 12:00:00 UTC+0 ==> first recomputed UD (equinox)
  c: .0488, // 4.88 %
  dt: aDay,
  dtReeval: _6months, // 6 months
  medianTimeBlocks: 1, // The medianTime always equals previous block's medianTime for easy testing
  avgGenTime: 3600 * 24 // 1 bloc a day
};

let s1:TestingServer, cat:TestUser, tac:TestUser

describe("Protocol 1.0 Ğ1 Dividend", function() {

  /*****
   * DESCRIPTION
   * -----------
   *
   * Simulates the real dividends that would occur in the currency (simulating N)
   */

  before(async () => {

    const res1 = await simpleNodeWith2Users(conf);
    s1 = res1.s1;
    cat = res1.cat; // HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd
    tac = res1.tac; // 2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc
    await s1.commit({ time: start });
    await s1.commit({ time: start + 1 });
    await s1.commit({ time: start + delayToUD });
    for (let i = 1; i < 15; i++) {
      await s1.commit({ time: (start + delayToUD) + aDay * i });
    }
  })

  after(() => {
    return Promise.all([
      s1.closeCluster()
    ])
  })

  it('should have block#0 has no UD', () => s1.expectThat('/blockchain/block/0', (json:HttpBlock) => {
    should.not.exist(json.dividend);
    json.should.have.property('medianTime').equal(start); // 2016-03-08 16:03:10 UTC+0
  }));

  it('should have block#1 has no UD', () => s1.expectThat('/blockchain/block/1', (json:HttpBlock) => {
    (json.dividend as any).should.equal(1000);
    json.should.have.property('medianTime').equal(start); // 2016-03-08 16:03:10 UTC+0
  }));

  it('should have block#2 with UD 1000', () => s1.expectThat('/blockchain/block/2', (json:HttpBlock) => {
    should.not.exist(json.dividend);
    json.should.have.property('medianTime').equal(start + 1); // 2016-03-08 16:03:11 UTC+0
  }));

  it('should have block#3 with UD 1000', () => s1.expectThat('/blockchain/block/3', (json:HttpBlock) => {
    (json.dividend as any).should.equal(1000);
    json.should.have.property('medianTime').equal(start + delayToUD); // 2016-03-09 12:00:00 UTC+0
  }));

  it('should have block#4 with UD 1000', () => s1.expectThat('/blockchain/block/4', (json:HttpBlock) => {
    (json.dividend as any).should.equal(1000);
    json.should.have.property('medianTime').equal((start + delayToUD) + aDay); // 2016-03-10 12:00:00 UTC+0
  }));

  it('should have block#4 with UD 1000', () => s1.expectThat('/blockchain/block/5', (json:HttpBlock) => {
    (json.dividend as any).should.equal(1000);
    json.should.have.property('medianTime').equal((start + delayToUD) + aDay * 2); // 2016-03-11 12:00:00 UTC+0
  }));

  it('should have block#4 with UD 1000', () => s1.expectThat('/blockchain/block/6', (json:HttpBlock) => {
    (json.dividend as any).should.equal(1000);
    json.should.have.property('medianTime').equal((start + delayToUD) + aDay * 3); // 2016-03-12 12:00:00 UTC+0
  }));

  // ... skip some blocks ...

  it('should have block#11 with UD 1000', () => s1.expectThat('/blockchain/block/11', (json:HttpBlock) => {
    (json.dividend as any).should.equal(1000);
    json.should.have.property('medianTime').equal((start + delayToUD) + aDay * 8); // 2016-03-17 12:00:00 UTC+0
  }));

  it('should have block#12 with UD 1000', () => s1.expectThat('/blockchain/block/12', (json:HttpBlock) => {
    (json.dividend as any).should.equal(1000);
    json.should.have.property('medianTime').equal((start + delayToUD) + aDay * 9); // 2016-03-18 12:00:00 UTC+0
  }));

  it('should have block#13 with UD 1000', () => s1.expectThat('/blockchain/block/13', (json:HttpBlock) => {
    (json.dividend as any).should.equal(1000);
    json.should.have.property('medianTime').equal((start + delayToUD) + aDay * 10); // 2016-03-19 12:00:00 UTC+0
  }));

  it('should have block#14 with UD 1000', () => s1.expectThat('/blockchain/block/14', (json:HttpBlock) => {
    (json.dividend as any).should.equal(1000);
    json.should.have.property('medianTime').equal((start + delayToUD) + aDay * 11); // 2016-03-20 12:00:00 UTC+0
  }));

  it('should have block#14 with UD 1000, even if dtReeval has been reached', () => s1.expectThat('/blockchain/block/15', (json:HttpBlock) => {
    (json.dividend as any).should.equal(1000);
    json.should.have.property('medianTime').equal((start + delayToUD) + aDay * 12); // 2016-03-21 12:00:00 UTC+0
  }));

  it('should have block#14 with UD 1000, even if dtReeval has been reached', () => s1.expectThat('/blockchain/block/16', (json:HttpBlock) => {
    (json.dividend as any).should.equal(1000);
    json.should.have.property('medianTime').equal((start + delayToUD) + aDay * 13); // 2016-03-22 12:00:00 UTC+0
  }));
});
