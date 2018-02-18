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
const co            = require('co');
const should        = require('should');
const indexer       = require('../../app/lib/indexer').Indexer

describe("Protocol BR_G11 - udTime", function(){

  it('root block good udTime', () => co(function*(){
    const conf   = { udTime0: 1500000000 };
    const HEAD_1 = null;
    const HEAD   = { number: 0 };
    indexer.prepareUDTime(HEAD, HEAD_1, conf);
    HEAD.udTime.should.equal(conf.udTime0);
  }));

  it('block with medianTime < udTime', () => co(function*(){
    const conf   = { dt: 100 };
    const HEAD_1 = { number: 59, udTime:     1500000900 };
    const HEAD   = { number: 60, medianTime: 1500000899 };
    indexer.prepareUDTime(HEAD, HEAD_1, conf);
    HEAD.udTime.should.equal(HEAD_1.udTime);
  }));

  it('block with medianTime == udTime', () => co(function*(){
    const conf   = { dt: 100 };
    const HEAD_1 = { number: 59, udTime:     1500000900 };
    const HEAD   = { number: 60, medianTime: 1500000900 };
    indexer.prepareUDTime(HEAD, HEAD_1, conf);
    HEAD.udTime.should.equal(HEAD_1.udTime + conf.dt);
  }));

  it('block with medianTime > udTime', () => co(function*(){
    const conf   = { dt: 100 };
    const HEAD_1 = { number: 59, udTime:     1500000900 };
    const HEAD   = { number: 60, medianTime: 1500000901 };
    indexer.prepareUDTime(HEAD, HEAD_1, conf);
    HEAD.udTime.should.equal(HEAD_1.udTime + conf.dt);
  }));

});
