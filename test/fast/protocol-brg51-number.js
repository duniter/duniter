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

const FAIL = false;
const SUCCESS = true;

describe("Protocol BR_G51 - Number", function(){

  it('1 following 1 should fail', () => co(function*(){
    const block  = { number: 1 };
    const HEAD_1 = { number: 1 };
    const HEAD   = {};
    indexer.prepareNumber(HEAD, HEAD_1);
    indexer.ruleNumber(block, HEAD).should.equal(FAIL);
  }));

  it('1 following 0 should succeed', () => co(function*(){
    const block  = { number: 1 };
    const HEAD_1 = { number: 0 };
    const HEAD   = {};
    indexer.prepareNumber(HEAD, HEAD_1);
    indexer.ruleNumber(block, HEAD).should.equal(SUCCESS);
  }));

  it('0 following 0 should fail', () => co(function*(){
    const block  = { number: 0 };
    const HEAD_1 = { number: 0 };
    const HEAD   = {};
    indexer.prepareNumber(HEAD, HEAD_1);
    indexer.ruleNumber(block, HEAD).should.equal(FAIL);
  }));

  it('0 following nothing should succeed', () => co(function*(){
    const block  = { number: 0 };
    const HEAD_1 = null;
    const HEAD   = {};
    indexer.prepareNumber(HEAD, HEAD_1);
    indexer.ruleNumber(block, HEAD).should.equal(SUCCESS);
  }));

  it('4 following nothing should fail', () => co(function*(){
    const block  = { number: 4 };
    const HEAD_1 = null;
    const HEAD   = {};
    indexer.prepareNumber(HEAD, HEAD_1);
    indexer.ruleNumber(block, HEAD).should.equal(FAIL);
  }));

  it('4 following 2 should fail', () => co(function*(){
    const block  = { number: 4 };
    const HEAD_1 = { number: 2 };
    const HEAD   = {};
    indexer.prepareNumber(HEAD, HEAD_1);
    indexer.ruleNumber(block, HEAD).should.equal(FAIL);
  }));

  it('4 following 3 should succeed', () => co(function*(){
    const block  = { number: 4 };
    const HEAD_1 = { number: 3 };
    const HEAD   = {};
    indexer.prepareNumber(HEAD, HEAD_1);
    indexer.ruleNumber(block, HEAD).should.equal(SUCCESS);
  }));

});
