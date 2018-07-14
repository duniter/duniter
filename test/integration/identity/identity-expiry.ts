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

import {BmaDependency} from "../../../app/modules/bma/index"
import {NewTestingServer, TestingServer} from "../tools/toolbox"
import {TestUser} from "../tools/TestUser"
import {Underscore} from "../../../app/lib/common-libs/underscore"
import {HttpRequirements} from "../../../app/modules/bma/lib/dtos"
import {ProverDependency} from "../../../app/modules/prover/index"
import {shutDownEngine} from "../tools/shutdown-engine"
import {expectAnswer, expectError} from "../tools/http-expect"

const should    = require('should');
const rp        = require('request-promise');

const MEMORY_MODE = true;
const commonConf = {
  ipv4: '127.0.0.1',
  currency: 'bb',
  httpLogs: true,
  forksize: 3,
  xpercent: 0.9,
  msValidity: 10000,
  idtyWindow: 1, // 1 second of duration
  sigQty: 1
};

let s1:TestingServer, cat:TestUser, tac:TestUser, tic:TestUser, toc:TestUser

const now = 1482300000;

describe("Identities expiry", function() {

  before(async () => {

    s1 = NewTestingServer(
      Underscore.extend({
        name: 'bb11',
        memory: MEMORY_MODE,
        port: '8560',
        pair: {
          pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
          sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
        }
      }, commonConf));

    cat = new TestUser('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
    tac = new TestUser('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, { server: s1 });
    tic = new TestUser('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });
    toc = new TestUser('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });

    await s1.initWithDAL().then(BmaDependency.duniter.methods.bma).then((bmapi) => bmapi.openConnections());
    ProverDependency.duniter.methods.hookServer(s1._server)
    await cat.createIdentity();
    await tac.createIdentity();
    await tic.createIdentity();
    await cat.cert(tac);
    await tac.cert(cat);
    await cat.join();
    await tac.join();
    await s1.commit({
      time: now
    });
    await toc.createIdentity();
    await toc.join();
    await s1.commit({
      time: now + 5
    })
  });

  after(() => {
    return shutDownEngine(s1)
  })

  it('should have requirements failing for tic', function() {
    // tic has been cleaned up, since its identity has expired after the root block
    return expectError(404, 'No identity matching this pubkey or uid', rp('http://127.0.0.1:8560/wot/requirements/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', { json: true }));
  });

  it('should have requirements failing for toc', function() {
    return expectAnswer(rp('http://127.0.0.1:8560/wot/requirements/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', { json: true }), (res:HttpRequirements) => {
      res.should.have.property('identities').length(1);
      res.identities[0].should.have.property('pubkey').equal('DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo');
      res.identities[0].should.have.property('uid').equal('toc');
      res.identities[0].should.have.property('expired').equal(false);
    });
  });

  it('should have requirements failing for toc', async () => {
    // tic has been cleaned up after the block#2
    await s1.commit({
      time: now + 5
    });
    return expectError(404, 'No identity matching this pubkey or uid', rp('http://127.0.0.1:8560/wot/requirements/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', { json: true }));
  })
});
