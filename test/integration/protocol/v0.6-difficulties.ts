// Source file from duniter: Crypto-currency software to manage libre currency such as Ğ1
// Copyright (C) 2018  Cedric Moreau <cem.moreau@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

import {serverWaitBlock, simpleNetworkOf2NodesAnd2Users, TestingServer} from "../tools/toolbox"

const should    = require('should');

const conf = {
  avgGenTime: 5000,
  medianTimeBlocks: 1 // The medianTime always equals previous block's medianTime
};

const now = 1480937906;

let s1:TestingServer, s2:TestingServer

describe("Protocol 0.6 Difficulties", function() {

  before(async () => {

    const res = await simpleNetworkOf2NodesAnd2Users(conf);
    s1 = res.s1;
    s2 = res.s2;
    await Promise.all([
      s1.commit({ time: now }),
      s2.until('block', 1)
    ])
  })

  after(() => {
    return Promise.all([
      s1.closeCluster(),
      s2.closeCluster()
    ])
  })

  it('should be able to emit a block#1 by a different user', async () => {
    await Promise.all([
      s1.commit({ time: now }), // medianOfBlocksInFrame = MEDIAN([1]) = 1
      serverWaitBlock(s1._server, 1),
      serverWaitBlock(s2._server, 1)
    ])
    await Promise.all([
      s2.commit({ time: now }), // medianOfBlocksInFrame = MEDIAN([1]) = 1
      serverWaitBlock(s1._server, 2),
      serverWaitBlock(s2._server, 2)
    ])
    await s1.expectJSON('/blockchain/current', {
      number: 2,
      issuer: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc'
    });
    await s1.expectJSON('/blockchain/block/0', {
      number: 0,
      issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd'
    });
    await s1.expectJSON('/blockchain/hardship/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', { level: 4 }); // medianOfBlocksInFrame = MEDIAN([1, 1]) = 1, personal_excess = 100%, level = 4
    await s1.expectJSON('/blockchain/hardship/2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', { level: 4 }); // medianOfBlocksInFrame = MEDIAN([1, 1]) = 1, personal_excess = 100%, level = 4
    await s1.commit({ time: now });
    await s1.expectJSON('/blockchain/hardship/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', { level: 4 }); // medianOfBlocksInFrame = MEDIAN([1, 2]) = 1.5, personal_excess = 3/1.5 = 100%, level = 4
    await s1.expectJSON('/blockchain/hardship/2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', { level: 1 }); // medianOfBlocksInFrame = MEDIAN([1, 2]) = 1.5, personal_excess = 2/1.5 = 33%, level = 1
    await s1.commit({ time: now });
    await s1.expectJSON('/blockchain/hardship/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', { level: 4 }); // medianOfBlocksInFrame = MEDIAN([1, 3]) = 2, personal_excess = 4/2 = 100%, level = 4
    await s1.expectJSON('/blockchain/hardship/2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', { level: 0 }); // medianOfBlocksInFrame = MEDIAN([1, 3]) = 2, personal_excess = 2/2 = 0%, level = 0
    await s1.commit({ time: now });
    await s1.expectJSON('/blockchain/hardship/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', { level: 4 }); // medianOfBlocksInFrame = MEDIAN([1, 4]) = 2.5, personal_excess = 5/2.5 = 100%, level = 4
    await s1.expectJSON('/blockchain/hardship/2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', { level: 0 }); // medianOfBlocksInFrame = MEDIAN([1, 4]) = 2.5, personal_excess = 2/2.5 = 0%, level = 0
    await s1.commit({ time: now });
    await s1.expectJSON('/blockchain/hardship/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', { level: 4 }); // ... [1, 5] ... = 4
    await s1.expectJSON('/blockchain/hardship/2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', { level: 0 }); // ... [1, 5] ... = 0
    await s1.commit({ time: now });
    await s1.expectJSON('/blockchain/hardship/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', { level: 4 }); // ... [1, 6] ... = 4
    await s1.expectJSON('/blockchain/hardship/2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', { level: 0 }); // ... [1, 6] ... = 0
    await s1.commit({ time: now });
    await s1.expectJSON('/blockchain/hardship/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', { level: 4 }); // ... [1, 7] ... = 4
    await s1.expectJSON('/blockchain/hardship/2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', { level: 0 }); // ... [1, 7] ... = 0
    await s1.commit({ time: now });

    /*********************
     *  PowMin incremented
     ********************/

    await s1.expectJSON('/blockchain/hardship/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', { level: 5 }); // medianOfBlocksInFrame = MEDIAN([1, 8]) = 4.5, personal_excess = 9/4.5 = 100%, level = 1 + 4
    await s1.expectJSON('/blockchain/hardship/2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', { level: 1 }); // medianOfBlocksInFrame = MEDIAN([1, 8]) = 4.5, personal_excess = 1/4.5 = 0%, level = 1 + 0
    await s1.commit({ time: now });
    await s1.expectJSON('/blockchain/hardship/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', { level: 5 }); // ... [1, 9] ... = 5
    await s1.expectJSON('/blockchain/hardship/2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', { level: 1 }); // ... [1, 9] ... = 1
    await s1.commit({ time: now });
    await s1.expectJSON('/blockchain/hardship/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', { level: 5 }); // ... [1, 10] ... = 5
    await s1.expectJSON('/blockchain/hardship/2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', { level: 1 }); // ... [1, 10] ... = 1
    await s1.commit({ time: now });
    await s1.expectJSON('/blockchain/hardship/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', { level: 5 }); // ... [1, 11] ... = 5
    await s1.expectJSON('/blockchain/hardship/2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', { level: 1 }); // ... [1, 11] ... = 1
    await s1.commit({ time: now });

    /*********************
     *  Frame excluded `2LvDg21`
     ********************/

    await s1.expectJSON('/blockchain/hardship/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', { level: 1 }); // medianOfBlocksInFrame = MEDIAN([11]) = 11, personal_excess = 12/11 = 9%, level = 1
    await s1.expectJSON('/blockchain/hardship/2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', { level: 1 }); // medianOfBlocksInFrame = MEDIAN([11]) = 11, personal_excess = 0/11 = 0%, level = 1
  })
})
