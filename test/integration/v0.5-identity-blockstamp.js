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

const conf = {
  avgGenTime: 5000,
  medianTimeBlocks: 1 // The medianTime always equals previous block's medianTime
};

const now = 1578540000;

let s1, s2, tuc;

describe("Protocol 0.5 Identity blockstamp", function() {

  before(() => co(function*() {

    const res1 = yield toolbox.simpleNodeWith2Users(conf);
    const res2 = yield toolbox.simpleNodeWith2otherUsers(conf);
    s1 = res1.s1;
    s2 = res2.s1;

    tuc = yield toolbox.createUser('tuc', '3conGDUXdrTGbQPMQQhEC4Ubu1MCAnFrAYvUaewbUhtk', '5ks7qQ8Fpkin7ycXpxQSxxjVhs8VTzpM3vEBMqM7NfC1ZiFJ93uQryDcoM93Mj77T6hDAABdeHZJDFnkDb35bgiU', s1);
  }));

  after(() => {
    return Promise.all([
      s1.closeCluster(),
      s2.closeCluster()
    ])
  })

  it('should be able to create tuc on s1', () => co(function*() {
    yield s1.commit({ time: now });
    yield s1.commit({ time: now });
    yield s2.commit({ time: now });
    yield s2.commit({ time: now });
    yield tuc.createIdentity();
  }));

  it('should not be able to create tuc on s2, using identity generated on s1', () => co(function*() {

    try {
      yield tuc.submitIdentity(tuc.getIdentityRaw(), s2);
      throw { message: 'Submitting wrong identity should have thrown an error' };
    } catch (e) {
      if (!(typeof e == "string") || e.match(/Submitting wrong identity should have thrown an error/)) {
        throw e;
      }
    }
  }));
});
