"use strict";
const co            = require('co');
const should        = require('should');
const indexer       = require('../../../app/lib/dup/indexer');

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
