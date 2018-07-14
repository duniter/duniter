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

import {TestUser} from "../tools/TestUser"
import {NewTestingServer, simpleNetworkOf2NodesAnd2Users, TestingServer} from "../tools/toolbox"
import {CrawlerDependency} from "../../../app/modules/crawler/index"

const es        = require('event-stream');
const should    = require('should');

const NB_CORES_FOR_COMPUTATION = 1 // For simple tests. Can be changed to test multiple cores.

let s1:TestingServer, s2:TestingServer, s3:TestingServer, i1:TestUser, i2:TestUser

describe("Continous proof-of-work", function() {

  before(async () => {

    s1 = NewTestingServer({
      cpu: 1,
      nbCores: NB_CORES_FOR_COMPUTATION,
      powDelay: 100,
      powMin: 1,
      pair: {
        pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
        sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
      }
    })

    i1 = new TestUser('i1',   { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
    i2 = new TestUser('i2',   { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });

    await s1.prepareForNetwork();
    await i1.createIdentity();
    await i2.createIdentity();
    await i1.cert(i2);
    await i2.cert(i1);
    await i1.join();
    await i2.join();
    await s1.commit();
    await s1.closeCluster();
  })

  it('should automatically stop waiting if nothing happens', async () => {
    s1.conf.powSecurityRetryDelay = 10;
    let start = Date.now();
    s1.startBlockComputation();
    // s1.permaProver.should.have.property('loops').equal(0);
    await s1.until('block', 1);
    // s1.permaProver.should.have.property('loops').equal(1);
    (start - Date.now()).should.be.belowOrEqual(1000);
    await s1.stopBlockComputation();
    await new Promise((resolve) => setTimeout(resolve, 100));
    // s1.permaProver.should.have.property('loops').equal(2);
    s1.conf.powSecurityRetryDelay = 10 * 60 * 1000;
    await s1.revert();
    s1.permaProver.loops = 0;
    await s1.stopBlockComputation();
  })

  it('should be able to start generation and find a block', async () => {
    s1.permaProver.should.have.property('loops').equal(0);
    await [
      s1.startBlockComputation(),
      s1.until('block', 2)
    ];
    // Should have made:
    // * 1 loop between block 0 and 1 by waiting
    // * 1 loop for making b#1
    // * 1 loop by waiting between b#1 and b#2
    // * 1 loop for making b#2
    await new Promise((resolve) => setTimeout(resolve, 100));
    // s1.permaProver.should.have.property('loops').equal(4);
    await s1.stopBlockComputation();

    // If we wait a bit, the loop should be ended
    await new Promise((resolve) => setTimeout(resolve, 100));
    // s1.permaProver.should.have.property('loops').equal(5);
    await s1.stopBlockComputation();
  })

  it('should be able to cancel generation because of a blockchain switch', async () => {
    // s1.permaProver.should.have.property('loops').equal(5);
    s1.startBlockComputation();
    await s1.until('block', 1);
    // * 1 loop for making b#3
    await new Promise((resolve) => setTimeout(resolve, 100));
    // s1.permaProver.should.have.property('loops').equal(6);
    await s1.permaProver.blockchainChanged();
    await new Promise((resolve) => setTimeout(resolve, 100));
    // * 1 loop for waiting for b#4 but being interrupted
    s1.permaProver.should.have.property('loops').greaterThanOrEqual(4);
    await s1.stopBlockComputation();

    // If we wait a bit, the loop should be ended
    await new Promise((resolve) => setTimeout(resolve, 100));
    s1.permaProver.should.have.property('loops').greaterThanOrEqual(5);
  })

  it('testing proof-of-work during a block pulling', async () => {
    const res = await simpleNetworkOf2NodesAnd2Users({
      nbCores: NB_CORES_FOR_COMPUTATION,
      powMin: 0
    }), s2 = res.s1, s3 = res.s2;
    await s2.commit();
    s2.conf.cpu = 1.0;
    s2.startBlockComputation();
    await s2.until('block', 15);
    await s2.stopBlockComputation();
    await [
      CrawlerDependency.duniter.methods.pullBlocks(s3._server),
      new Promise(res => {
        s3.pipe(es.mapSync((e:any) => {
          if (e.number === 15) {
            res()
          }
          return e
        }))

      }),
      s3.startBlockComputation()
    ];
    const current = await s3.get('/blockchain/current')
    await s3.stopBlockComputation();
    current.number.should.be.aboveOrEqual(14)
    await s1.closeCluster()
  })
});
