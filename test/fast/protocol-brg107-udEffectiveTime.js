"use strict";
const co            = require('co');
const should        = require('should');
const indexer       = require('../../app/lib/indexer');

describe("Protocol BR_G107 - udReevalTime", function(){

  it('root block good udReevalTime', () => co(function*(){
    const conf   = { udReevalTime0: 1500000000 };
    const HEAD_1 = null;
    const HEAD   = { number: 0 };
    indexer.prepareUDTime(HEAD, HEAD_1, conf);
    HEAD.udReevalTime.should.equal(conf.udReevalTime0);
  }));

  it('block with medianTime < udReevalTime', () => co(function*(){
    const conf   = { dt: 100, dtReeval: 20 };
    const HEAD_1 = { number: 59, udReevalTime: 1500000900 };
    const HEAD   = { number: 60, medianTime:   1500000899 };
    indexer.prepareUDTime(HEAD, HEAD_1, conf);
    HEAD.udReevalTime.should.equal(HEAD_1.udReevalTime);
  }));

  it('block with medianTime == udReevalTime', () => co(function*(){
    const conf   = { dt: 100, dtReeval: 20 };
    const HEAD_1 = { number: 59, udReevalTime: 1500000900 };
    const HEAD   = { number: 60, medianTime:   1500000900 };
    indexer.prepareUDTime(HEAD, HEAD_1, conf);
    HEAD.udReevalTime.should.equal(HEAD_1.udReevalTime + conf.dtReeval);
  }));

  it('block with medianTime > udReevalTime', () => co(function*(){
    const conf   = { dt: 100, dtReeval: 20 };
    const HEAD_1 = { number: 59, udReevalTime: 1500000900 };
    const HEAD   = { number: 60, medianTime:   1500000901 };
    indexer.prepareUDTime(HEAD, HEAD_1, conf);
    HEAD.udReevalTime.should.equal(HEAD_1.udReevalTime + conf.dtReeval);
  }));

});
