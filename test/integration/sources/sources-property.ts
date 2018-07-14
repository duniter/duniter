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
import {HttpBlock, HttpSources} from "../../../app/modules/bma/lib/dtos"

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

describe("Sources property", function() {

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

  it('it should exist block#1 with UD of 200', () => s1.expect('/blockchain/block/1', (block:HttpBlock) => {
    should.exists(block);
    assert.equal(block.number, 1);
    assert.equal(block.dividend, 200);
  }));

  it('it should exist sources for HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', () => s1.expect('/tx/sources/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', (res:HttpSources) => {
    assert.equal(res.sources.length, 1)
  }));

  it('it should NOT exist sources if we change one letter to uppercased version', () => s1.expect('/tx/sources/HGTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', (res:HttpSources) => {
    assert.equal(res.sources.length, 0)
  }));
});
