"use strict";
const co            = require('co');
const should        = require('should');
const indexer       = require('../../../app/lib/dup/indexer');

const FAIL = false;
const SUCCESS = true;

describe("Protocol BR_G50 - Block size", function(){

  it('2 for an AVG(10) should succeed', () => co(function*(){
    const HEAD   = { bsize: 2, avgBlockSize: 10 };
    indexer.ruleBlockSize(HEAD).should.equal(SUCCESS);
  }));

  it('400 for an AVG(10) should succeed', () => co(function*(){
    const HEAD   = { bsize: 400, avgBlockSize: 10 };
    indexer.ruleBlockSize(HEAD).should.equal(SUCCESS);
  }));

  it('499 for an AVG(10) should succeed', () => co(function*(){
    const HEAD   = { bsize: 499, avgBlockSize: 10 };
    indexer.ruleBlockSize(HEAD).should.equal(SUCCESS);
  }));

  it('500 for an AVG(10) should fail', () => co(function*(){
    const HEAD   = { bsize: 500, avgBlockSize: 10 };
    indexer.ruleBlockSize(HEAD).should.equal(FAIL);
  }));

  it('500 for an AVG(454) should fail', () => co(function*(){
    const HEAD   = { bsize: 500, avgBlockSize: 454 };
    indexer.ruleBlockSize(HEAD).should.equal(FAIL);
  }));

  it('500 for an AVG(455) should succeed', () => co(function*(){
    const HEAD   = { bsize: 500, avgBlockSize: 455 };
    indexer.ruleBlockSize(HEAD).should.equal(SUCCESS);
  }));

  it('1100 for an AVG(1000) should fail', () => co(function*(){
    const HEAD   = { bsize: 1100, avgBlockSize: 1000 };
    indexer.ruleBlockSize(HEAD).should.equal(FAIL);
  }));

  it('1100 for an AVG(1001) should succeed', () => co(function*(){
    const HEAD   = { bsize: 1100, avgBlockSize: 1001 };
    indexer.ruleBlockSize(HEAD).should.equal(SUCCESS);
  }));
});
