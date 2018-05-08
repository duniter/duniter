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
import {FullMindexEntry} from "../../../app/lib/indexer"
import {HttpBlock, HttpLookup} from "../../../app/modules/bma/lib/dtos"

const assert    = require('assert');
const should    = require('should');

const now = 1480000000;

let s1:TestingServer, cat:TestUser, tac:TestUser, tic:TestUser

describe("Implicit revocation", function() {

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
    await tic.createIdentity();
    await cat.cert(tac);
    await tac.cert(tic);
    await tic.cert(cat);
    await cat.join();
    await tac.join();
    await tic.join();
    await s1.commit({ time: now });
    await s1.commit({ time: now + 8 });
    await s1.commit({ time: now + 9 });
    await cat.join();
    await tac.join();
    await s1.commit({ time: now + 10 });
    await s1.commit({ time: now + 10 });
    await s1.commit({ time: now + 11 });
    await s1.commit({ time: now + 15 });
    await s1.commit({ time: now + 15 });
    await cat.join();
    await tac.join();
    await s1.commit({ time: now + 20 });
    await s1.commit({ time: now + 20 });
  })

  after(() => {
    return Promise.all([
      s1.closeCluster()
    ])
  })

  it('block#4 should have kicked tic', () => s1.expectThat('/blockchain/block/5', (res:HttpBlock) => {
    assert.deepEqual(res.excluded, [
      'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV'
    ]);
  }));

  it('should exist implicit revocation traces', async () => {
    const ms = (await s1.dal.mindexDAL.getReducedMS('DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV')) as FullMindexEntry
    ms.should.have.property('revoked_on').equal(1480000020)
  })

  it('should answer that tic is revoked on API', () => s1.expectThat('/wot/lookup/tic', (res:HttpLookup) => {
    res.should.have.property('results').length(1);
    res.results[0].should.have.property('uids').length(1);
    res.results[0].uids[0].should.have.property('uid').equal('tic');
    res.results[0].uids[0].should.have.property('revoked').equal(true);
    res.results[0].uids[0].should.have.property('revoked_on').equal(1480000020);
    res.results[0].uids[0].should.have.property('revocation_sig').equal(null);
  }));
});
