"use strict";

const co        = require('co');
const should    = require('should');
const bma       = require('../../app/lib/streams/bma');
const constants = require('../../app/lib/constants');
const limiter   = require('../../app/lib/system/limiter');
const toolbox   = require('./tools/toolbox');
const multicaster = require('../../app/lib/streams/multicaster');

const conf = {
  dt: 30,
  avgGenTime: 5000,
  medianTimeBlocks: 1 // The medianTime always equals previous block's medianTime
};

const now = 1578540000;

let s1;

describe("Protocol 0.5 Transaction version", function() {

  before(() => co(function*() {

    constants.TIME_FOR_V5 = 1478543978; // 2016-11-07 19:39:38

    limiter.noLimit();
    const res1 = yield toolbox.simpleNodeWith2Users(conf);
    s1 = res1.s1;
    const cat = res1.cat;
    const tac = res1.tac;
    yield s1.commit({ time: now });
    yield s1.commit({ time: now + 100 });
    yield s1.commit({ time: now + 100 });
    yield cat.sendP(51, tac);
  }));

  it('should not have a block with v5 transaction, but v3', () => co(function*() {
    const block = yield s1.commit({ time: now + 100 });
    should.exists(block.transactions[0]);
    block.transactions[0].version.should.equal(3);
  }));
});
