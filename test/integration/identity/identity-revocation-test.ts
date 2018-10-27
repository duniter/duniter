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

"use strict";

import {NewTestingServer, TestingServer} from "../tools/toolbox"
import {TestUser} from "../tools/TestUser"
import {BmaDependency} from "../../../app/modules/bma/index"
import {Underscore} from "../../../app/lib/common-libs/underscore"
import {HttpLookup, HttpMembers} from "../../../app/modules/bma/lib/dtos"
import {shutDownEngine} from "../tools/shutdown-engine"
import {expectAnswer} from "../tools/http-expect"

const should    = require('should');
const rp        = require('request-promise');

BmaDependency.duniter.methods.noLimit(); // Disables the HTTP limiter

const MEMORY_MODE = true;
const commonConf = {
  ipv4: '127.0.0.1',
  currency: 'bb',
  httpLogs: true,
  forksize: 3,
  xpercent: 0.9,
  msValidity: 10000,
  sigQty: 1,
  avgGenTime: 300
};

let s1:TestingServer, s2:TestingServer, cat:TestUser, tic:TestUser, toc:TestUser, tacOnS1:TestUser, tacOnS2:TestUser

describe("Revocation behavior", function() {

  before(async () => {

    s1 = NewTestingServer(
      Underscore.extend({
        name: 'bb12',
        memory: MEMORY_MODE,
        port: '9964',
        pair: {
          pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo',
          sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'
        }
      }, commonConf));

    s2 = NewTestingServer(
      Underscore.extend({
        name: 'bb13',
        memory: MEMORY_MODE,
        port: '9965',
        pair: {
          pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
          sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
        }
      }, commonConf));

    cat = new TestUser('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
    tic = new TestUser('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });
    toc = new TestUser('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });
    tacOnS1 = new TestUser('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, { server: s1 });
    tacOnS2 = new TestUser('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, { server: s2 });

    const now = 1400000000
    await s1.initWithDAL().then(BmaDependency.duniter.methods.bma).then((bmapi) => bmapi.openConnections());
    await s2.initWithDAL().then(BmaDependency.duniter.methods.bma).then((bmapi) => bmapi.openConnections());
    await cat.createIdentity();
    await tic.createIdentity();
    await toc.createIdentity();
    await cat.cert(tic);
    await tic.cert(cat);
    await tic.cert(toc);
    await toc.cert(tic);
    await cat.join();
    await tic.join();
    await toc.join();
    await s1.commit({ time: now });

    // We have the following WoT:
    /**
     *  cat <-> tic <-> toc
     */
  });

  after(() => {
    return Promise.all([
      shutDownEngine(s1),
      shutDownEngine(s2)
    ])
  })

  it('should have 3 members', function() {
    return expectAnswer(rp('http://127.0.0.1:9964/wot/members', { json: true }), function(res:HttpMembers) {
      res.should.have.property('results').length(3);
      Underscore.pluck(res.results, 'uid').sort().should.deepEqual(['cat', 'tic', 'toc']);
    });
  });

  it('cat should not be revoked yet', () => expectAnswer(rp('http://127.0.0.1:9964/wot/lookup/cat', { json: true }), function(res:HttpLookup) {
    res.should.have.property('results').length(1);
    res.results[0].should.have.property('uids').length(1);
    res.results[0].uids[0].should.have.property('uid').equal('cat');
    res.results[0].uids[0].should.have.property('revoked').equal(false);
    res.results[0].uids[0].should.have.property('revoked_on').equal(null);
    res.results[0].uids[0].should.have.property('revocation_sig').equal(null);
  }));

  it('sending a revocation for cat should be displayed', async () => {
    await cat.revoke();
    return expectAnswer(rp('http://127.0.0.1:9964/wot/lookup/cat', { json: true }), function(res:HttpLookup) {
      res.should.have.property('results').length(1);
      res.results[0].should.have.property('uids').length(1);
      res.results[0].uids[0].should.have.property('uid').equal('cat');
      res.results[0].uids[0].should.have.property('revoked').equal(false);
      res.results[0].uids[0].should.have.property('revoked_on').equal(null);
      res.results[0].uids[0].should.have.property('revocation_sig').not.equal(null);
      res.results[0].uids[0].should.have.property('revocation_sig').not.equal('');
    });
  })

  it('sending a revocation for tac should add an identity', async () => {
    await tacOnS1.createIdentity();
    const idty = await tacOnS1.lookup(tacOnS1.pub);
    await tacOnS2.revoke(idty);
    // On S1 server, tac is known as normal identity
    await expectAnswer(rp('http://127.0.0.1:9964/wot/lookup/tac', { json: true }), function(res:HttpLookup) {
      res.should.have.property('results').length(1);
      res.results[0].should.have.property('uids').length(1);
      res.results[0].uids[0].should.have.property('uid').equal('tac');
      res.results[0].uids[0].should.have.property('revoked').equal(false);
      res.results[0].uids[0].should.have.property('revoked_on').equal(null);
      res.results[0].uids[0].should.have.property('revocation_sig').equal(null);
    });
    // On S2 server, tac is known as identity with revocation pending (not written! so `revoked` field is false)
    await expectAnswer(rp('http://127.0.0.1:9965/wot/lookup/tac', { json: true }), function(res:HttpLookup) {
      res.should.have.property('results').length(1);
      res.results[0].should.have.property('uids').length(1);
      res.results[0].uids[0].should.have.property('uid').equal('tac');
      res.results[0].uids[0].should.have.property('revoked').equal(false);
      res.results[0].uids[0].should.have.property('revoked_on').equal(null);
      res.results[0].uids[0].should.have.property('revocation_sig').not.equal(null);
      res.results[0].uids[0].should.have.property('revocation_sig').not.equal('');
    });
  })

  it('if we commit a revocation, cat should be revoked', async () => {
    await s1.commit({ revoked: [], excluded: [] });
    await s1.commit();
    return expectAnswer(rp('http://127.0.0.1:9964/wot/lookup/cat', { json: true }), function(res:HttpLookup) {
      res.should.have.property('results').length(1);
      res.results[0].should.have.property('uids').length(1);
      res.results[0].uids[0].should.have.property('uid').equal('cat');
      res.results[0].uids[0].should.have.property('revoked').equal(true);
      res.results[0].uids[0].should.have.property('revoked_on').equal(1400003570);
      res.results[0].uids[0].should.have.property('revocation_sig').not.equal(null);
      res.results[0].uids[0].should.have.property('revocation_sig').not.equal('');
    });
  })

  it('should have 2 members', function() {
    return expectAnswer(rp('http://127.0.0.1:9964/wot/members', { json: true }), function(res:HttpMembers) {
      res.should.have.property('results').length(2);
      Underscore.pluck(res.results, 'uid').sort().should.deepEqual(['tic','toc']);
    });
  });

  it('cat should not be able to join back', async () => {
    try {
      await cat.join();
    } catch (e) {
      should.exists(e);
    }
    await s1.commit();
    return expectAnswer(rp('http://127.0.0.1:9964/wot/members', { json: true }), function(res:HttpMembers) {
      res.should.have.property('results').length(2);
      Underscore.pluck(res.results, 'uid').sort().should.deepEqual(['tic','toc']);
    });
  })

  it('if we revert the commit, cat should not be revoked', async () => {
    await s1.revert();
    await s1.revert();
    await s1.dal.blockDAL.removeForkBlockAboveOrEqual(2)
    return expectAnswer(rp('http://127.0.0.1:9964/wot/lookup/cat', { json: true }), function(res:HttpLookup) {
      res.should.have.property('results').length(1);
      res.results[0].should.have.property('uids').length(1);
      res.results[0].uids[0].should.have.property('uid').equal('cat');
      res.results[0].uids[0].should.have.property('revoked').equal(false);
      res.results[0].uids[0].should.have.property('revoked_on').equal(null);
      res.results[0].uids[0].should.have.property('revocation_sig').equal(null); // We loose the revocation
      res.results[0].uids[0].should.have.property('revocation_sig').equal(null);
    });
  })

  it('if we commit again, cat should NOT be revoked (we have lost the revocation)', async () => {
    await s1.commit();
    return expectAnswer(rp('http://127.0.0.1:9964/wot/lookup/cat', { json: true }), function(res:HttpLookup) {
      res.should.have.property('results').length(1);
      res.results[0].should.have.property('uids').length(1);
      res.results[0].uids[0].should.have.property('uid').equal('cat');
      res.results[0].uids[0].should.have.property('revoked').equal(false);
      res.results[0].uids[0].should.have.property('revoked_on').equal(null);
      res.results[0].uids[0].should.have.property('revocation_sig').equal(null); // We loose the revocation
      res.results[0].uids[0].should.have.property('revocation_sig').equal(null);
    });
  })

})
