"use strict";
const co            = require('co');
const should        = require('should');
const indexer       = require('../../../app/lib/dup/indexer');

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
