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
import {HttpBlock} from "../../../app/modules/bma/lib/dtos"

const assert    = require('assert');

const now = 1480000000;

let s1:TestingServer, cat:TestUser, tac:TestUser, tic:TestUser, toc:TestUser, tuc:TestUser

describe("Identities kicking by certs", function() {

  before(async () => {

    s1 = NewTestingServer({
      pair: {
        pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
        sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
      },
      dt: 3600,
      ud0: 1200,
      xpercent: 0.9,
      sigValidity: 5, // 5 second of duration
      sigQty: 2
    });

    cat = new TestUser('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
    tac = new TestUser('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, { server: s1 });
    tic = new TestUser('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });
    toc = new TestUser('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });
    tuc = new TestUser('tuc', { pub: '3conGDUXdrTGbQPMQQhEC4Ubu1MCAnFrAYvUaewbUhtk', sec: '5ks7qQ8Fpkin7ycXpxQSxxjVhs8VTzpM3vEBMqM7NfC1ZiFJ93uQryDcoM93Mj77T6hDAABdeHZJDFnkDb35bgiU'}, { server: s1 });

    await s1.initDalBmaConnections();
    await cat.createIdentity();
    await tac.createIdentity();
    await toc.createIdentity();
    await cat.cert(tac);
    await cat.cert(toc);
    await tac.cert(cat);
    await tac.cert(toc);
    await toc.cert(cat);
    await toc.cert(tac);
    await cat.join();
    await tac.join();
    await toc.join();
    await s1.commit({ time: now });
    await s1.commit({ time: now + 3 });
    await s1.commit({ time: now + 5 });
    await tic.createIdentity();
    await cat.cert(tic);
    await tac.cert(tic);
    await tic.join();
    await tuc.createIdentity();
    await s1.commit({ time: now + 8 });
    await tic.cert(cat);
    await cat.cert(tuc);
    await tac.cert(tuc);
    await tuc.join();
    await s1.commit({ time: now + 8 });
    await tuc.cert(cat);
    await s1.commit({ time: now + 8 });
    await s1.commit({ time: now + 8 });
    await s1.commit({ time: now + 8 });
    await cat.revoke();
    await s1.commitWaitError({ time: now + 8, excluded: ['3conGDUXdrTGbQPMQQhEC4Ubu1MCAnFrAYvUaewbUhtk'] }, "ruleToBeKickedArePresent")
    await s1.commit({ time: now + 8 });
  })

  after(() => {
    return Promise.all([
      s1.closeCluster()
    ])
  })

  it('block#7 should have kicked 2 member', () => s1.expectJSON('/blockchain/block/7', (res:HttpBlock) => {
    assert.deepEqual(res.excluded, [
      '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc',
      'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo'
    ]);
  }));

  it('block#8 should have kicked 1 member', () => s1.expectJSON('/blockchain/block/8', (res:HttpBlock) => {
    assert.deepEqual(res.excluded, [
      'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd'
    ]);
  }));
});
