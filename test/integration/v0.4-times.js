"use strict";

const co        = require('co');
const should    = require('should');
const bma       = require('../../app/lib/streams/bma');
const user      = require('./tools/user');
const commit    = require('./tools/commit');
const until     = require('./tools/until');
const toolbox   = require('./tools/toolbox');
const multicaster = require('../../app/lib/streams/multicaster');

const conf = {
  avgGenTime: 5000,
  medianTimeBlocks: 1 // The medianTime always equals previous block's medianTime
};

const now = 1475069096;
let s1;

describe("Protocol 0.4 Times", function() {

  before(() => co(function*() {
    const res = yield toolbox.simpleNodeWith2Users(conf);
    s1 = res.s1;
    yield s1.commit({ time: now }); // We must issue a normal root block, because always medianTime(0) == time(0)
  }));

  it('a V4 block should not accept a time = medianTime + avgGenTime * 1.189', () => co(function*() {
    yield s1.commit({ medianTime: now, time: Math.ceil(now + conf.avgGenTime * 1.189) });
    yield s1.revert();
  }));

  it('a V4 block should not accept a time > medianTime + avgGenTime * 1.189', () => co(function*() {
    try {
      yield s1.commitExpectError({ medianTime: now, time: Math.ceil(now + conf.avgGenTime * 1.189) + 1 });
    } catch (e) {
      e.should.have.property('message').equal('A block must have its Time between MedianTime and MedianTime + 5945');
    }
  }));
});
