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

const now = 1480937906;

let s1, s2;

const BACKUP_TIME_FOR_V6 = constants.TIME_FOR_V6;

describe("Protocol 0.6 Difficulties", function() {

  before(() => co(function*() {

    constants.TIME_FOR_V6 = 1478543978; // 2016-11-07 19:39:38

    limiter.noLimit();
    const res = yield toolbox.simpleNetworkOf2NodesAnd2Users(conf);
    s1 = res.s1;
    s2 = res.s2;
    yield [
      s1.commit({ time: now }),
      s2.until('block', 1)
    ];
  }));

  it('should be able to emit a block#1 by a different user', () => co(function*() {
    yield [
      s1.commit({ time: now }), // medianOfBlocksInFrame = MEDIAN([1]) = 1
      s2.until('block', 1),
      s1.until('block', 1)
    ];
    yield [
      s2.commit({ time: now }), // medianOfBlocksInFrame = MEDIAN([1]) = 1
      s2.until('block', 1),
      s1.until('block', 1)
    ];
    yield s1.expectJSON('/blockchain/current', {
      version: 6,
      number: 2,
      issuer: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc'
    });
    yield s1.expectJSON('/blockchain/block/0', {
      version: 6,
      number: 0,
      issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd'
    });
    yield s1.expectJSON('/blockchain/hardship/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', { level: 4 }); // medianOfBlocksInFrame = MEDIAN([1, 1]) = 1, personal_excess = 100%, level = 4
    yield s1.expectJSON('/blockchain/hardship/2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', { level: 4 }); // medianOfBlocksInFrame = MEDIAN([1, 1]) = 1, personal_excess = 100%, level = 4
    yield s1.commit({ time: now });
    yield s1.expectJSON('/blockchain/hardship/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', { level: 4 }); // medianOfBlocksInFrame = MEDIAN([1, 2]) = 1.5, personal_excess = 3/1.5 = 100%, level = 4
    yield s1.expectJSON('/blockchain/hardship/2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', { level: 1 }); // medianOfBlocksInFrame = MEDIAN([1, 2]) = 1.5, personal_excess = 2/1.5 = 33%, level = 1
    yield s1.commit({ time: now });
    yield s1.expectJSON('/blockchain/hardship/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', { level: 4 }); // medianOfBlocksInFrame = MEDIAN([1, 3]) = 2, personal_excess = 4/2 = 100%, level = 4
    yield s1.expectJSON('/blockchain/hardship/2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', { level: 0 }); // medianOfBlocksInFrame = MEDIAN([1, 3]) = 2, personal_excess = 2/2 = 0%, level = 0
    yield s1.commit({ time: now });
    yield s1.expectJSON('/blockchain/hardship/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', { level: 4 }); // medianOfBlocksInFrame = MEDIAN([1, 4]) = 2.5, personal_excess = 5/2.5 = 100%, level = 4
    yield s1.expectJSON('/blockchain/hardship/2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', { level: 0 }); // medianOfBlocksInFrame = MEDIAN([1, 4]) = 2.5, personal_excess = 2/2.5 = 0%, level = 0
    yield s1.commit({ time: now });
    yield s1.expectJSON('/blockchain/hardship/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', { level: 4 }); // ... [1, 5] ... = 4
    yield s1.expectJSON('/blockchain/hardship/2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', { level: 0 }); // ... [1, 5] ... = 0
    yield s1.commit({ time: now });
    yield s1.expectJSON('/blockchain/hardship/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', { level: 4 }); // ... [1, 6] ... = 4
    yield s1.expectJSON('/blockchain/hardship/2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', { level: 0 }); // ... [1, 6] ... = 0
    yield s1.commit({ time: now });
    yield s1.expectJSON('/blockchain/hardship/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', { level: 4 }); // ... [1, 7] ... = 4
    yield s1.expectJSON('/blockchain/hardship/2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', { level: 0 }); // ... [1, 7] ... = 0
    yield s1.commit({ time: now });

    /*********************
     *  PowMin incremented
     ********************/

    yield s1.expectJSON('/blockchain/hardship/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', { level: 5 }); // medianOfBlocksInFrame = MEDIAN([1, 8]) = 4.5, personal_excess = 9/4.5 = 100%, level = 1 + 4
    yield s1.expectJSON('/blockchain/hardship/2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', { level: 1 }); // medianOfBlocksInFrame = MEDIAN([1, 8]) = 4.5, personal_excess = 1/4.5 = 0%, level = 1 + 0
    yield s1.commit({ time: now });
    yield s1.expectJSON('/blockchain/hardship/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', { level: 5 }); // ... [1, 9] ... = 5
    yield s1.expectJSON('/blockchain/hardship/2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', { level: 1 }); // ... [1, 9] ... = 1
    yield s1.commit({ time: now });
    yield s1.expectJSON('/blockchain/hardship/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', { level: 5 }); // ... [1, 10] ... = 5
    yield s1.expectJSON('/blockchain/hardship/2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', { level: 1 }); // ... [1, 10] ... = 1
    yield s1.commit({ time: now });
    yield s1.expectJSON('/blockchain/hardship/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', { level: 5 }); // ... [1, 11] ... = 5
    yield s1.expectJSON('/blockchain/hardship/2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', { level: 1 }); // ... [1, 11] ... = 1
    yield s1.commit({ time: now });

    /*********************
     *  Frame excluded `2LvDg21`
     ********************/

    yield s1.expectJSON('/blockchain/hardship/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', { level: 1 }); // medianOfBlocksInFrame = MEDIAN([11]) = 11, personal_excess = 12/11 = 9%, level = 1
    yield s1.expectJSON('/blockchain/hardship/2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', { level: 1 }); // medianOfBlocksInFrame = MEDIAN([11]) = 11, personal_excess = 0/11 = 0%, level = 1
  }));

  after(() => {
    constants.TIME_FOR_V6 = BACKUP_TIME_FOR_V6;
  });
});
