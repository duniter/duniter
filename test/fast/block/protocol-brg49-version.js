"use strict";
const co            = require('co');
const should        = require('should');
const indexer       = require('../../../app/lib/dup/indexer');

const FAIL = false;
const SUCCESS = true;

describe("Protocol BR_G49 - Version", function(){

  it('V13 following V12 should fail', () => co(function*(){
    const HEAD_1 = { number: 17, version: 13 };
    const HEAD   = { number: 18, version: 12 };
    indexer.ruleVersion(HEAD, HEAD_1).should.equal(FAIL);
  }));

  it('V14 following V12 should fail', () => co(function*(){
    const HEAD_1 = { number: 17, version: 14 };
    const HEAD   = { number: 18, version: 12 };
    indexer.ruleVersion(HEAD, HEAD_1).should.equal(FAIL);
  }));

  it('V13 following V14 should succeed', () => co(function*(){
    const HEAD_1 = { number: 17, version: 13 };
    const HEAD   = { number: 18, version: 14 };
    indexer.ruleVersion(HEAD, HEAD_1).should.equal(SUCCESS);
  }));

  it('V13 following V15 should fail', () => co(function*(){
    const HEAD_1 = { number: 17, version: 13 };
    const HEAD   = { number: 18, version: 15 };
    indexer.ruleVersion(HEAD, HEAD_1).should.equal(FAIL);
  }));
});
