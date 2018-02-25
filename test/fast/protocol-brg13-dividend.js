"use strict";
const co            = require('co');
const should        = require('should');
const indexer       = require('../../app/lib/indexer').Indexer

describe("Protocol BR_G13 - dividend", function(){

  it('root block has no dividend', () => co(function*(){
    const conf   = { udTime0: 1500000000, dt: 100 };
    const HEAD_1 = null;
    const HEAD   = { number: 0 };
    indexer.prepareUDTime(HEAD, HEAD_1, conf);
    indexer.prepareDividend(HEAD, HEAD_1, conf);
    should.equal(HEAD.dividend, null);
  }));

  it('block with medianTime < udTime has no dividend', () => co(function*(){
    const conf   = { dt: 100 };
    const HEAD_1 = { number: 59, udTime:     1500000900 };
    const HEAD   = { number: 60, medianTime: 1500000899 };
    indexer.prepareUDTime(HEAD, HEAD_1, conf);
    indexer.prepareDividend(HEAD, HEAD_1, conf);
    HEAD.udTime.should.equal(HEAD_1.udTime);
    should.equal(HEAD.dividend, null);
  }));

  it('block with medianTime == udTime', () => co(function*(){
    const conf   = { dt: 100, dtReeval: 100, c: 0.0488 };
    const HEAD_1 = { number: 59, udTime:     1500000900, udReevalTime: 1500000900, dividend: 100, mass: 18000, massReeval: 18000, unitBase: 1 };
    const HEAD   = { number: 60, medianTime: 1500000900, membersCount: 3 };
    indexer.prepareUDTime(HEAD, HEAD_1, conf);
    indexer.prepareDividend(HEAD, HEAD_1, conf);
    HEAD.udTime.should.equal(HEAD_1.udTime + conf.dt);
    should.equal(HEAD.dividend, 102);
  }));

  it('block with medianTime > udTime', () => co(function*(){
    const conf   = { dt: 100, dtReeval: 100, c: 0.0488 };
    const HEAD_1 = { number: 59, udTime:     1500000900, udReevalTime: 1500000900, dividend: 100, mass: 18000, massReeval: 18000, unitBase: 1 };
    const HEAD   = { number: 60, medianTime: 1500000901, membersCount: 3 };
    indexer.prepareUDTime(HEAD, HEAD_1, conf);
    indexer.prepareDividend(HEAD, HEAD_1, conf);
    HEAD.udTime.should.equal(HEAD_1.udTime + conf.dt);
    should.equal(HEAD.dividend, 102);
  }));

});
