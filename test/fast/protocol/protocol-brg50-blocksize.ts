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

const FAIL = false;
const SUCCESS = true;

describe("Protocol BR_G50 - Block size", function(){
  
  it('2 for an AVG(10) should succeed', async () => {
    const HEAD   = { number: 24, bsize: 2, avgBlockSize: 10 } as any
    Indexer.ruleBlockSize(HEAD).should.equal(SUCCESS);
  })

  it('400 for an AVG(10) should succeed', async () => {
    const HEAD   = { number: 24, bsize: 400, avgBlockSize: 10 } as any
    Indexer.ruleBlockSize(HEAD).should.equal(SUCCESS);
  })

  it('499 for an AVG(10) should succeed', async () => {
    const HEAD   = { number: 24, bsize: 499, avgBlockSize: 10 } as any
    Indexer.ruleBlockSize(HEAD).should.equal(SUCCESS);
  })

  it('500 for an AVG(10) should fail', async () => {
    const HEAD   = { number: 24, bsize: 500, avgBlockSize: 10 } as any
    Indexer.ruleBlockSize(HEAD).should.equal(FAIL);
  })

  it('500 for an AVG(454) should fail', async () => {
    const HEAD   = { number: 24, bsize: 500, avgBlockSize: 454} as any
    Indexer.ruleBlockSize(HEAD).should.equal(FAIL);
  })

  it('500 for an AVG(455) should succeed', async () => {
    const HEAD   = { number: 24, bsize: 500, avgBlockSize: 455} as any
    Indexer.ruleBlockSize(HEAD).should.equal(SUCCESS);
  })

  it('1100 for an AVG(1000) should fail', async () => {
    const HEAD   = { number: 24, bsize: 1100, avgBlockSize: 1000} as any
    Indexer.ruleBlockSize(HEAD).should.equal(FAIL);
  })

  it('1100 for an AVG(1001) should succeed', async () => {
    const HEAD   = { number: 24, bsize: 1100, avgBlockSize: 1001} as any
    Indexer.ruleBlockSize(HEAD).should.equal(SUCCESS);
  })

  it('1100 for block#0 should succeed', async () => {
    const HEAD   = { number: 0, bsize: 1100, avgBlockSize: 0} as any
    Indexer.ruleBlockSize(HEAD).should.equal(SUCCESS);
  })
});
