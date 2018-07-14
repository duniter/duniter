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
import {HttpSources, HttpTxHistory} from "../../../app/modules/bma/lib/dtos"

const should    = require('should');

const now = 1484000000;

let s1:TestingServer, cat:TestUser, tac:TestUser, tic:TestUser


describe("Protocol 1.1 Dividend", function() {

  before(async () => {

    s1 = NewTestingServer({
      c: 0.1,
      dt: 10,
      dtReeval: 10,
      udTime0: now + 10,
      udReevalTime0: now + 10,
      ud0: 100,
      pair: {
        pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
        sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
      },
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
    await s1.commit({ time: now + 10 });
    await s1.commit({ time: now + 10 * 2 });
    await s1.commit({ time: now + 10 * 3 });

    // tic joins
    await tic.createIdentity();
    await cat.cert(tic);
    await tic.join();
    await s1.commit({ time: now + 10 + 10 * 4 });
    await s1.commit({ time: now + 10 + 10 * 5 });
  })

  after(() => {
    return Promise.all([
      s1.closeCluster()
    ])
  })

  it('should exit 2 dividends for cat', () => s1.expect('/tx/sources/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', (res:HttpSources) => {
    res.should.have.property('pubkey').equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
    res.should.have.property('sources').length(4);
    res.sources[0].should.have.property('amount').equal(100); // UD(0) = ud0 => M(0) = 0
    res.sources[1].should.have.property('amount').equal(100); // t = 1, M(t-1) = 0; , N(t) = 2, UD(t) = UD(t-1) + c²*M(t-1)/N(t) = 100 + 0.01*0/2 = 100 (ceiled) => M(1) = 200
    res.sources[2].should.have.property('amount').equal(101); // t = 2, M(t-1) = 200, N(t) = 3, UD(t) = UD(t-1) + c²*M(t-1)/N(t) = 100 + 0.01*200/3 = 101 (ceiled) => M(2) = M(1)+N(t-1)*DU(t-1) = 200+2*100 = 400
    res.sources[3].should.have.property('amount').equal(103); // t = 3, M(t-1) = 402, N(t) = 3, UD(t) = UD(t-1) + c²*M(t-1)/N(t) = 101 + 0.01*400/3 = 103 (ceiled) => M(3) = M(2)+N(t-1)*DU(t-1) = 400+3*101 = 703
    res.sources[0].should.have.property('base').equal(0);
    res.sources[1].should.have.property('base').equal(0);
  }))

  it('should be able to send 300 units', async () => {
    await cat.sendMoney(105, tac);
    await s1.commit();
    await s1.expect('/tx/sources/2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', (res:HttpSources) => {
      res.should.have.property('pubkey').equal('2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc');
      res.should.have.property('sources').length(6);
      res.sources[0].should.have.property('amount').equal(100);
      res.sources[1].should.have.property('amount').equal(100);
      res.sources[2].should.have.property('amount').equal(101);
      res.sources[3].should.have.property('amount').equal(103);
      res.sources[4].should.have.property('amount').equal(106);
      res.sources[5].should.have.property('amount').equal(105);
      res.sources[0].should.have.property('type').equal('D');
      res.sources[1].should.have.property('type').equal('D');
      res.sources[2].should.have.property('type').equal('D');
      res.sources[3].should.have.property('type').equal('D');
      res.sources[4].should.have.property('type').equal('D');
      res.sources[5].should.have.property('type').equal('T');
    })
  })

  it('should have a correct history', () => s1.expect('/tx/history/2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', (res:HttpTxHistory) => {
    res.history.received[0].should.have.property('blockstamp').not.equal(null).not.equal('');
    res.history.received[0].should.have.property('blockstampTime').not.equal(null).greaterThan(0);
  }))
})
