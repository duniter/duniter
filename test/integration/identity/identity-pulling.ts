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
import {Underscore} from "../../../app/lib/common-libs/underscore"
import {HttpRequirements} from "../../../app/modules/bma/lib/dtos"
import {CrawlerDependency} from "../../../app/modules/crawler/index"

const assert    = require('assert');

let s1:TestingServer, s2:TestingServer, cat1:TestUser, tac1:TestUser, toc2:TestUser, tic2:TestUser, tuc2:TestUser

describe("Identity pulling", function() {

  before(async () => {

    s1 = NewTestingServer({
      pair: {
        pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
        sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
      }
    });
    s2 = NewTestingServer({
      pair: {
        pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc',
        sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'
      }
    });

    cat1 = new TestUser('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
    tac1 = new TestUser('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, { server: s1 });
    toc2 = new TestUser('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s2 });
    tic2 = new TestUser('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s2 });
    tuc2 = new TestUser('tuc', { pub: '3conGDUXdrTGbQPMQQhEC4Ubu1MCAnFrAYvUaewbUhtk', sec: '5ks7qQ8Fpkin7ycXpxQSxxjVhs8VTzpM3vEBMqM7NfC1ZiFJ93uQryDcoM93Mj77T6hDAABdeHZJDFnkDb35bgiU'}, { server: s2 });

    await s1.prepareForNetwork();
    await s2.prepareForNetwork();

    // Publishing identities
    await cat1.createIdentity();
    await tac1.createIdentity();
    await cat1.cert(tac1);
    await tac1.cert(cat1);
    await cat1.join();
    await tac1.join();
  })

  after(() => {
    return Promise.all([
      s1.closeCluster(),
      s2.closeCluster()
    ])
  })

  it('toc, tic and tuc can create their account on s2', async () => {
    await toc2.createIdentity();
    await tic2.createIdentity();
    await tuc2.createIdentity();
    await toc2.join();
    await tic2.join();
    await tuc2.join();
    // 2 certs for toc
    await cat1.cert(toc2, s2, s2);
    await tac1.cert(toc2, s2, s2);
    // 1 certs for tic
    await cat1.cert(tic2, s2, s2);
    // 0 certs for tuc

    // tic2 also revokes its pending identity
    await tic2.revoke()
  })

  it('toc should not be known of s1', async () => {
    await s1.expectError('/wot/lookup/toc', 404)
  })

  it('tic should not be known of s1', async () => {
    await s1.expectError('/wot/lookup/tic', 404)
  })

  it('tuc should not be known of s1', async () => {
    await s1.expectError('/wot/lookup/tuc', 404)
  })

  it('toc should have 2 certs on server2', async () => {
    await s2.expectThat('/wot/requirements-of-pending/2', (json:HttpRequirements) => {
      assert.equal(json.identities.length, 1)
      assert.equal(json.identities[0].pubkey, 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo')
      assert.equal(json.identities[0].uid, 'toc')
      assert.equal(json.identities[0].pendingCerts.length, 2)
      assert.equal(json.identities[0].pendingMemberships.length, 1)
    })
  })

  it('tic should have 1 certs on server2', async () => {
    await s2.expectThat('/wot/requirements-of-pending/1', (json:HttpRequirements) => {
      assert.equal(json.identities.length, 2)

      assert.equal(json.identities[1].pubkey, 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV')
      assert.equal(json.identities[1].uid, 'tic')
      assert.equal(json.identities[1].pendingCerts.length, 1)
      assert.equal(json.identities[1].pendingMemberships.length, 1)

      assert.equal(json.identities[0].pubkey, 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo')
      assert.equal(json.identities[0].uid, 'toc')
      assert.equal(json.identities[0].pendingCerts.length, 2)
      assert.equal(json.identities[0].pendingMemberships.length, 1)
    })
  })

  it('s1 should be able to pull sandbox data from s2', async () => {

    await s2.sharePeeringWith(s1)
    const pullSandbox = CrawlerDependency.duniter.methods.pullSandbox
    await pullSandbox(s1._server)
    await pullSandbox(s1._server)

    await s1.expectThat('/wot/requirements-of-pending/1', (json:HttpRequirements) => {

      json.identities = Underscore.sortBy(json.identities, 'pubkey')
      assert.equal(json.identities.length, 4)

      assert.equal(json.identities[3].pubkey, 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd')
      assert.equal(json.identities[3].uid, 'cat')
      assert.equal(json.identities[3].revocation_sig, null)
      assert.equal(json.identities[3].pendingCerts.length, 1)
      assert.equal(json.identities[3].pendingMemberships.length, 1)

      assert.equal(json.identities[0].pubkey, '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc')
      assert.equal(json.identities[0].uid, 'tac')
      assert.equal(json.identities[0].revocation_sig, null)
      assert.equal(json.identities[0].pendingCerts.length, 1)
      assert.equal(json.identities[0].pendingMemberships.length, 1)

      assert.equal(json.identities[2].pubkey, 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV')
      assert.equal(json.identities[2].uid, 'tic')
      assert.equal(json.identities[2].revocation_sig, 'AAFSisqkMb/2L4/YmZXQWoKYxnz/PW1c2wbux+ZRe8Iw8dxthPR4Iw+g+/JKA5nPE+C/lkX2YFrIikgUpZdlAA==')
      assert.equal(json.identities[2].pendingCerts.length, 1)
      assert.equal(json.identities[2].pendingMemberships.length, 1)

      assert.equal(json.identities[1].pubkey, 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo')
      assert.equal(json.identities[1].uid, 'toc')
      assert.equal(json.identities[1].revocation_sig, null)
      assert.equal(json.identities[1].pendingCerts.length, 2)
      assert.equal(json.identities[1].pendingMemberships.length, 1)
    })
  })

})
