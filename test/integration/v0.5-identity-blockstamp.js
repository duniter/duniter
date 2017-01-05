"use strict";

const co        = require('co');
const should    = require('should');
const bma       = require('../../app/lib/streams/bma');
const constants = require('../../app/lib/constants');
const limiter   = require('../../app/lib/system/limiter');
const toolbox   = require('./tools/toolbox');
const multicaster = require('../../app/lib/streams/multicaster');

const conf = {
  avgGenTime: 5000,
  medianTimeBlocks: 1 // The medianTime always equals previous block's medianTime
};

const now = 1578540000;

let s1, s2, tuc;

describe("Protocol 0.5 Identity blockstamp", function() {

  before(() => co(function*() {

    limiter.noLimit();
    const res1 = yield toolbox.simpleNodeWith2Users(conf);
    const res2 = yield toolbox.simpleNodeWith2otherUsers(conf);
    s1 = res1.s1;
    s2 = res2.s1;

    tuc = yield toolbox.createUser('tuc', '3conGDUXdrTGbQPMQQhEC4Ubu1MCAnFrAYvUaewbUhtk', '5ks7qQ8Fpkin7ycXpxQSxxjVhs8VTzpM3vEBMqM7NfC1ZiFJ93uQryDcoM93Mj77T6hDAABdeHZJDFnkDb35bgiU', s1);
  }));

  it('should be able to create tuc on s1', () => co(function*() {
    yield s1.commit({ time: now });
    yield s1.commit({ time: now });
    yield s2.commit({ time: now });
    yield s2.commit({ time: now });
    yield tuc.createIdentity();
  }));

  it('should not be able to create tuc on s2, using identity generated on s1', () => co(function*() {

    try {
      yield tuc.submitIdentity(tuc.getIdentityRaw(), s2);
      throw { message: 'Submitting wrong identity should have thrown an error' };
    } catch (e) {
      if (!(typeof e == "string") || e.match(/Submitting wrong identity should have thrown an error/)) {
        throw e;
      }
    }
  }));
});
