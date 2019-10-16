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

describe("Protocol BR_G51 - Number", function(){

  it('1 following 1 should fail', async () => {
    const block  = { number: 1 } as any
    const HEAD_1 = { number: 1 } as any
    const HEAD   = {} as any
    Indexer.prepareNumber(HEAD, HEAD_1);
    Indexer.ruleNumber(block, HEAD).should.equal(FAIL);
  })

  it('1 following 0 should succeed', async () => {
    const block  = { number: 1 } as any
    const HEAD_1 = { number: 0 } as any
    const HEAD   = {} as any
    Indexer.prepareNumber(HEAD, HEAD_1);
    Indexer.ruleNumber(block, HEAD).should.equal(SUCCESS);
  })

  it('0 following 0 should fail', async () => {
    const block  = { number: 0 } as any
    const HEAD_1 = { number: 0 } as any
    const HEAD   = {} as any
    Indexer.prepareNumber(HEAD, HEAD_1);
    Indexer.ruleNumber(block, HEAD).should.equal(FAIL);
  })

  it('0 following nothing should succeed', async () => {
    const block  = { number: 0 } as any
    const HEAD_1 = null as any
    const HEAD   = {} as any
    Indexer.prepareNumber(HEAD, HEAD_1);
    Indexer.ruleNumber(block, HEAD).should.equal(SUCCESS);
  })

  it('4 following nothing should fail', async () => {
    const block  = { number: 4 } as any
    const HEAD_1 = null as any
    const HEAD   = {} as any
    Indexer.prepareNumber(HEAD, HEAD_1);
    Indexer.ruleNumber(block, HEAD).should.equal(FAIL);
  })

  it('4 following 2 should fail', async () => {
    const block  = { number: 4 } as any
    const HEAD_1 = { number: 2 } as any
    const HEAD   = {} as any
    Indexer.prepareNumber(HEAD, HEAD_1);
    Indexer.ruleNumber(block, HEAD).should.equal(FAIL);
  })

  it('4 following 3 should succeed', async () => {
    const block  = { number: 4 } as any
    const HEAD_1 = { number: 3 } as any
    const HEAD   = {} as any
    Indexer.prepareNumber(HEAD, HEAD_1);
    Indexer.ruleNumber(block, HEAD).should.equal(SUCCESS);
  })

})
