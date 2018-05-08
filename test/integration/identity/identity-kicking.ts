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

import {HttpRequirements} from "../../../app/modules/bma/lib/dtos"
import {BmaDependency} from "../../../app/modules/bma/index"
import {NewTestingServer, TestingServer} from "../tools/toolbox"
import {TestUser} from "../tools/TestUser"
import {Underscore} from "../../../app/lib/common-libs/underscore"
import {ProverDependency} from "../../../app/modules/prover/index"

const should    = require('should');
const rp        = require('request-promise');
const httpTest  = require('../tools/http');
const shutDownEngine  = require('../tools/shutDownEngine');

const expectAnswer   = httpTest.expectAnswer;

const MEMORY_MODE = true;
const commonConf = {
  ipv4: '127.0.0.1',
  currency: 'bb',
  httpLogs: true,
  forksize: 3,
  xpercent: 0.9,
  sigValidity: 1600, // 1600 second of duration
  msValidity: 3600, // 3600 second of duration
  sigQty: 1
};

let s1:TestingServer, cat:TestUser, tac:TestUser, toc:TestUser

describe("Identities kicking", function() {

  before(async () => {

    s1 = NewTestingServer(
      Underscore.extend({
        name: 'bb11',
        memory: MEMORY_MODE,
        port: '8561',
        pair: {
          pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
          sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
        }
      }, commonConf));

    cat = new TestUser('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
    tac = new TestUser('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, { server: s1 });
    toc = new TestUser('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });

    const now = 1400000000
    await s1.initWithDAL().then(BmaDependency.duniter.methods.bma).then((bmapi) => bmapi.openConnections());
    ProverDependency.duniter.methods.hookServer(s1._server)
    await cat.createIdentity();
    await tac.createIdentity();
    await cat.cert(tac);
    await tac.cert(cat);
    await cat.join();
    await tac.join();
    await s1.commit({
      time: now
    });
    await s1.commit({
      time: now + 2000
    });
    await s1.commit({
      time: now + 2000
    });
    // Update their membership
    await cat.join();
    await tac.join();
    // toc joins thereafter
    await toc.createIdentity();
    await toc.join();
    await cat.cert(toc);
    await tac.cert(toc);
    await s1.commit({
      time: now + 2000
    });
    await toc.cert(cat);
    await s1.commit({
      time: now + 5000
    });
    await s1.commit({
      time: now + 5000
    });
    await s1.commit({
      time: now + 5000
    });
  });

  after(() => {
    return Promise.all([
      shutDownEngine(s1)
    ])
  })

  /**
   *
   */

  it('membershipExpiresIn should be positive for cat (actualized member)', function() {
    return expectAnswer(rp('http://127.0.0.1:8561/wot/requirements/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', { json: true }), (res:HttpRequirements) => {
      res.should.have.property('identities').length(1);
      res.identities[0].should.have.property('pubkey').equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
      res.identities[0].should.have.property('uid').equal('cat');
      res.identities[0].should.have.property('expired').equal(false);
      res.identities[0].should.have.property('membershipExpiresIn').equal(1934);
    });
  });

  it('membershipExpiresIn should be positive for toc (member)', function() {
    return expectAnswer(rp('http://127.0.0.1:8561/wot/requirements/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', { json: true }), (res:HttpRequirements) => {
      res.should.have.property('identities').length(1);
      res.identities[0].should.have.property('pubkey').equal('DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo');
      res.identities[0].should.have.property('uid').equal('toc');
      res.identities[0].should.have.property('expired').equal(false);
      res.identities[0].should.have.property('membershipExpiresIn').equal(1934);
    });
  });

  it('membershipExpiresIn should equal 0 for a kicked member', function() {
    return expectAnswer(rp('http://127.0.0.1:8561/wot/requirements/2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', { json: true }), (res:HttpRequirements) => {
      res.should.have.property('identities').length(1);
      res.identities[0].should.have.property('pubkey').equal('2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc');
      res.identities[0].should.have.property('uid').equal('tac');
      res.identities[0].should.have.property('expired').equal(false);
      res.identities[0].should.have.property('membershipExpiresIn').equal(0);
    });
  });
});
