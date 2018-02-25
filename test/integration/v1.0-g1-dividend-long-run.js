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

"use strict";

const co        = require('co');
const should    = require('should');
const bma       = require('../../app/modules/bma').BmaDependency.duniter.methods.bma;
const constants = require('../../app/lib/constants');
const toolbox   = require('./tools/toolbox');

const start = 1488985390; // 2016-03-08 16:03:10 UTC+0
const delayToUD = 1489057200 - start; // Delay to 2016-03-09 12:00:00 UTC+0

const aDay = 3600 * 24;
const _6months = 15778800;

const conf = {
  sigValidity: _6months * 160, // A whole life
  msValidity: _6months * 160, // A whole life
  ud0: 1000,
  udTime0: 1488970800, // 2016-03-08 12:00:00 UTC+0
  udReevalTime0: 1490094000, // 2016-03-21 12:00:00 UTC+0 ==> first recomputed UD (equinox)
  c: .0488, // 4.88 %
  dt: aDay,
  cpu: 1.,
  dtReeval: _6months, // 6 months
  medianTimeBlocks: 1, // The medianTime always equals previous block's medianTime for easy testing
  avgGenTime: 3600 * 24 // 1 bloc a day
};

let s1, cat, tac;

describe("Protocol 1.0 Ğ1 Dividend - long run", function() {

  /*****
   * DESCRIPTION
   * -----------
   *
   * Simulates the real dividends that would occur in the currency (simulating N)
   */

  before(() => co(function*() {

    const res1 = yield toolbox.simpleNodeWith2Users(conf);
    s1 = res1.s1;
    cat = res1.cat; // HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd
    tac = res1.tac; // 2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc
    yield s1.commit({ time: start });
    yield s1.commit({ time: start + 1 });
    yield s1.commit({ time: start + delayToUD });
    for (let i = 1; i < 20; i++) {
      yield s1.commit({ time: (start + delayToUD) + aDay * i });
    }
  }));

  after(() => {
    return Promise.all([
      s1.closeCluster()
    ])
  })

  it('should have block#0 has no UD', () => s1.expectThat('/blockchain/block/0', (json) => {
    should.not.exist(json.dividend);
    json.should.have.property('medianTime').equal(start); // 2016-03-08 16:03:10 UTC+0
  }));

  it('should have block#1 has no UD', () => s1.expectThat('/blockchain/block/1', (json) => {
    json.dividend.should.equal(1000);
    json.should.have.property('medianTime').equal(start); // 2016-03-08 16:03:10 UTC+0
  }));

  it('should have block#2 with UD 1000', () => s1.expectThat('/blockchain/block/2', (json) => {
    should.not.exist(json.dividend);
    json.should.have.property('medianTime').equal(start + 1); // 2016-03-08 16:03:11 UTC+0
  }));

  it('should have block#3 with UD 1000', () => s1.expectThat('/blockchain/block/3', (json) => {
    json.dividend.should.equal(1000);
    json.should.have.property('medianTime').equal(start + delayToUD); // 2016-03-09 12:00:00 UTC+0
  }));

  it('should have block#4 with UD 1000', () => s1.expectThat('/blockchain/block/4', (json) => {
    json.dividend.should.equal(1000);
    json.should.have.property('medianTime').equal((start + delayToUD) + aDay); // 2016-03-10 12:00:00 UTC+0
  }));

  it('should have block#14 with UD 1000, even if dtReeval has been reached', () => s1.expectThat('/blockchain/block/15', (json) => {
    json.dividend.should.equal(1000);
    json.should.have.property('medianTime').equal((start + delayToUD) + aDay * 12); // 2016-03-21 12:00:00 UTC+0
  }));

  it('should have block#14 with UD 1000, even if dtReeval has been reached', () => s1.expectThat('/blockchain/block/16', (json) => {
    json.dividend.should.equal(1000);
    json.should.have.property('medianTime').equal((start + delayToUD) + aDay * 13); // 2016-03-22 12:00:00 UTC+0
  }));
});
