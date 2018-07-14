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
const commit    = require('./tools/commit');
const toolbox   = require('./tools/toolbox');

const conf = {
  avgGenTime: 5000,
  medianTimeBlocks: 1 // The medianTime always equals previous block's medianTime
};

const now = 1475069096;
let s1;

describe("Protocol 0.4 Times", function() {

  before(() => co(function*() {
    const res = yield toolbox.simpleNodeWith2Users(conf);
    s1 = res.s1;
    yield s1.commit({ time: now }); // We must issue a normal root block, because always medianTime(0) == time(0)
  }));

  after(() => {
    return Promise.all([
      s1.closeCluster()
    ])
  })

  it('a V4 block should not accept a time = medianTime + avgGenTime * 1.189', () => co(function*() {
    yield s1.commit({ medianTime: now, time: Math.ceil(now + conf.avgGenTime * 1.189) });
    yield s1.revert();
  }));

  it('a V4 block should not accept a time > medianTime + avgGenTime * 1.189', () => co(function*() {
    try {
      yield s1.commitExpectError({ medianTime: now, time: Math.ceil(now + conf.avgGenTime * 1.189) + 1 });
    } catch (e) {
      e.should.have.property('message').equal('A block must have its Time between MedianTime and MedianTime + 5945');
    }
  }));
});
