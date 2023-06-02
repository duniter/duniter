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
import {CommonConstants} from "../../../app/lib/common-libs/constants"
import {NewTestingServer, TestingServer} from "../tools/toolbox"
import {HttpBlock, HttpTxHistory} from "../../../app/modules/bma/lib/dtos"
import {Underscore} from "../../../app/lib/common-libs/underscore";

const should    = require('should');

let s1:TestingServer, cat1:TestUser, tac1:TestUser

describe("Transactions history", function() {

  const now = 1500000000
  const conf = {
    udTime0: now,
    dt: 30,
    avgGenTime: 5000,
    medianTimeBlocks: 2
  };

  before(async () => {

    s1 = NewTestingServer(Underscore.extend({
      currency: 'currency_one',
      pair: {
        pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
        sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
      }
    }, conf));

    cat1 = new TestUser('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
    tac1 = new TestUser('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, { server: s1 });

    await s1.prepareForNetwork();

    const now = parseInt(String(Date.now() / 1000))

    // Publishing identities
    await cat1.createIdentity();
    await tac1.createIdentity();
    await cat1.cert(tac1);
    await tac1.cert(cat1);
    await cat1.join();
    await tac1.join();
    await s1.commit();
    await s1.commit({
      time: now + conf.avgGenTime
    });
    await s1.commit();
    await cat1.sendMoney(20, tac1);
  })

  after(() => {
    return Promise.all([
      s1.closeCluster()
    ])
  })

  it('sending transactions should exist in /tx/history/:pubkey/pending', () => s1.expect('/tx/history/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd/pending', (res:HttpTxHistory) => {
    res.history.should.have.property('sending').length(1);
    res.history.should.have.property('pending').length(0);
  }));

  it('pending transactions should exist in /tx/history/:pubkey/pending', () => s1.expect('/tx/history/2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc/pending', (res:HttpTxHistory) => {
    res.history.should.have.property('sending').length(0);
    res.history.should.have.property('pending').length(1);
  }));

  it('sent and received transactions should should exist', async () => {
    await s1.commit();

    // cat1 pending should be empty
    await s1.expect('/tx/history/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd/pending', (res:HttpTxHistory) => {
      res.history.should.have.property('sending').length(0);
      res.history.should.have.property('pending').length(0);
    });
    // cat1 sent should have one element
    await s1.expect('/tx/history/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', (res:HttpTxHistory) => {
      res.history.should.have.property('sent').length(1);
      res.history.should.have.property('received').length(0);
    });
    // tac1 sending should be empty
    await s1.expect('/tx/history/2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc/pending', (res:HttpTxHistory) => {
      res.history.should.have.property('sending').length(0);
      res.history.should.have.property('pending').length(0);
    });
    // tac1 received should have one element
    await s1.expect('/tx/history/2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', (res:HttpTxHistory) => {
      res.history.should.have.property('sent').length(0);
      res.history.should.have.property('received').length(1);
    });
  })

  it('get transactions by blocks slice', async () => {

    const firstBlock = await s1.commit();

    // cat1 sent should have one element
    await s1.expect('/tx/history/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd/blocks/0/' + firstBlock.number, (res:HttpTxHistory) => {
      res.history.should.have.property('sent').length(1);
      res.history.should.have.property('received').length(0);
    });

    // Add a pending TX from tac1 -> cat1
    await s1.commit({
      time: firstBlock.time + conf.avgGenTime
    });
    await tac1.sendMoney(10, cat1);
    const secondBlock = await s1.commit();

    // Should not appear in sliced history
    await s1.expect('/tx/history/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd/blocks/0/' + firstBlock.number, (res:HttpTxHistory) => {
      res.history.should.have.property('sent').length(1);
      res.history.should.have.property('received').length(0);
    });
    await s1.expect('/tx/history/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd/blocks/' + (firstBlock.number + 1) + '/' + secondBlock.number, (res:HttpTxHistory) => {
      res.history.should.have.property('sent').length(0);
      res.history.should.have.property('received').length(1);
    });

    // Whole history
    await s1.expect('/tx/history/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', (res:HttpTxHistory) => {
      res.history.should.have.property('sent').length(1);
      res.history.should.have.property('received').length(1);
    });
  })

  it('get transactions by times slice', async () => {

    const medianTimeOffset = conf.avgGenTime * conf.medianTimeBlocks / 2;
    const firstBlock = await s1.commit();
    const startTime = firstBlock.medianTime + medianTimeOffset;

    // Should not have TX yet
    await s1.expect(`/tx/history/${cat1.pub}/times/${startTime}/${startTime + conf.avgGenTime - 1}`, (res:HttpTxHistory) => {
      res.history.should.have.property('sent').length(0);
      res.history.should.have.property('received').length(0);
    });

    // Add a pending TX from tac1 -> cat1
    await tac1.sendMoney(10, cat1);
    const secondBlock = await s1.commit({
      time: firstBlock.time + conf.avgGenTime
    });
    should(secondBlock).property('time').greaterThan(firstBlock.time);
    const secondTime = secondBlock.medianTime + medianTimeOffset;

    // Previous range (before TX) should still be empty
    await s1.expect(`/tx/history/${cat1.pub}/times/${startTime}/${secondTime - 1}`, (res:HttpTxHistory) => {
      res.history.should.have.property('sent').length(0);
      res.history.should.have.property('received').length(0);
    });

    // Should appear in next range
    await s1.expect(`/tx/history/${cat1.pub}/times/${secondTime}/${secondTime + conf.avgGenTime}`, (res:HttpTxHistory) => {
      res.history.should.have.property('sent').length(0);
      res.history.should.have.property('received').length(1);
    });
  })
})
