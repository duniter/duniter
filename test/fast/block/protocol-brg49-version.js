"use strict";
const co            = require('co');
const should        = require('should');
const indexer       = require('../../../app/lib/dup/indexer');

const FAIL = false;
const SUCCESS = true;

describe("Protocol BR_G49 - Version", function(){

  it('V3 following V2 should fail', () => co(function*(){
    const HEAD_1 = { number: 17, version: 3 };
    const HEAD   = { number: 18, version: 2 };
    indexer.ruleVersion(HEAD, HEAD_1).should.equal(FAIL);
  }));

  it('V4 following V2 should fail', () => co(function*(){
    const HEAD_1 = { number: 17, version: 4 };
    const HEAD   = { number: 18, version: 2 };
    indexer.ruleVersion(HEAD, HEAD_1).should.equal(FAIL);
  }));

  it('V3 following V4 should succeed', () => co(function*(){
    const HEAD_1 = { number: 17, version: 3 };
    const HEAD   = { number: 18, version: 4 };
    indexer.ruleVersion(HEAD, HEAD_1).should.equal(SUCCESS);
  }));

  it('V3 following V5 should fail', () => co(function*(){
    const HEAD_1 = { number: 17, version: 3 };
    const HEAD   = { number: 18, version: 5 };
    indexer.ruleVersion(HEAD, HEAD_1).should.equal(FAIL);
  }));
});
