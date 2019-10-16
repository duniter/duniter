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

const should    = require('should');

let s1:TestingServer, cat1:TestUser, tac1:TestUser

describe("Transactions pruning", function() {

  before(async () => {

    s1 = NewTestingServer({
      currency: 'currency_one',
      dt: 600,
      pair: {
        pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
        sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
      }
    });

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
      time: now + 1300
    });
    await s1.commit();
    await cat1.sendMoney(20, tac1)
    await cat1.sendMoney(100, tac1)
  })

  after(() => {
    return Promise.all([
      s1.closeCluster()
    ])
  })

  it('double spending transactions should both exist first', () => s1.expect('/tx/history/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', (res:HttpTxHistory) => {
    res.history.should.have.property('sending').length(2);
  }));

  it('should only commit 1 tx', async () => {
    await s1.commit();
    await s1.expect('/blockchain/block/2', (res:HttpBlock) => {
      res.should.have.property('transactions').length(0);
    });
    await s1.expect('/blockchain/block/3', (res:HttpBlock) => {
      res.should.have.property('transactions').length(1);
    });
  })

  it('double spending transaction should have been pruned', async () => {
    const tmp = CommonConstants.TRANSACTION_MAX_TRIES;
    CommonConstants.TRANSACTION_MAX_TRIES = 1;
    await s1.commit();
    await s1.expect('/tx/history/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', (res:HttpTxHistory) => {
      res.history.should.have.property('sending').length(0);
    });
    CommonConstants.TRANSACTION_MAX_TRIES = tmp;
  })
})
