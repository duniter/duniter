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

import {NewTestingServer, TestingServer} from "../tools/toolbox"
import {TestUser} from "../tools/TestUser"
import {shouldFail} from "../../unit-tools"

const assert    = require('assert');
const should    = require('should');

const now = 1480000000;

let s1:TestingServer, cat:TestUser, tac:TestUser, tic:TestUser

describe("Certifier must be a member", function() {

  before(async () => {

    s1 = NewTestingServer({
      pair: {
        pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
        sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
      },
      sigValidity: 100,
      msValidity: 10,
      sigQty: 1,
      medianTimeBlocks: 1
    });

    cat = new TestUser('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
    tac = new TestUser('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, { server: s1 });
    tic = new TestUser('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });

    await s1.initDalBmaConnections();
    await cat.createIdentity();
    await tac.createIdentity();
    await cat.cert(tac);
    await tac.cert(cat);
    await cat.join();
    await tac.join();
    await s1.commit({ time: now });
    await s1.commit({ time: now + 8 });
    await s1.commit({ time: now + 9 });
  })

  it('tic should not be able to certify yet', async () => {
    await tic.createIdentity();
    await tic.join();
    await cat.cert(tic);
    await shouldFail(tic.cert(cat), 'Certifier must be a member')
  })

  it('block#3 should see tic becoming member', async () => {
    await cat.join();
    await tac.join();
    await s1.commit({ time: now + 16 });
    await s1.expectThat('/blockchain/block/3', (res:any) => {
      res.should.have.property('joiners').length(1);
    })
  })

  it('tic is now a member, he should be able to certify', async () => {
    await tic.cert(cat);
    await s1.commit({ time: now + 16 });
    await cat.join();
    await tac.join();
    await s1.commit({ time: now + 21 });
  })

  it('tic should be excluded', async () => {
    await s1.commit({ time: now + 21 });
    await s1.commit({ time: now + 22 });
    await s1.expectThat('/blockchain/block/7', (res:any) => {
      res.should.have.property('excluded').length(1);
      res.excluded[0].should.equal('DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV')
    })
  })

  it('tic should not be able to certify as he is no more a member', async () => {
    await shouldFail(tic.cert(tac), 'Certifier must be a member')
  })

  it('tic should be able to certify when he joins back', async () => {
    await tic.join();
    await s1.commit({ time: now + 23 });
    await tic.cert(tac);
  })

  after(() => {
    return s1.closeCluster()
  })
})
