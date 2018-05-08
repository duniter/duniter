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

const co        = require('co');
const assert    = require('assert');
const TestUser  = require('./tools/TestUser').TestUser
const commit    = require('./tools/commit');
const toolbox   = require('./tools/toolbox');
const CommonConstants = require('../../app/lib/common-libs/constants').CommonConstants

const now = 1500000000

let s1, s2, cat, tac

describe("Single document treatment", function() {

  before(() => co(function*() {

    s1 = toolbox.server({
      // The common conf
      medianTimeBlocks: 1,
      avgGenTime: 11,
      udTime0: now,
      udReevalTime0: now,
      pair: {
        pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
        sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
      }
    });

    s2 = toolbox.server({
      pair: {
        pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc',
        sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'
      }
    });

    cat = new TestUser('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
    tac = new TestUser('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, { server: s1 });

    yield s1.prepareForNetwork();
    yield s2.prepareForNetwork();

    // Publishing identities
    yield cat.createIdentity();
    yield tac.createIdentity();
    yield cat.cert(tac);
    yield tac.cert(cat);
    yield cat.join();
    yield tac.join();
  }));

  after(() => {
    return Promise.all([
      s1.closeCluster(),
      s2.closeCluster()
    ])
  })

  it('should create a common blockchain', () => co(function*() {
    const b0 = yield s1.commit({ time: now })
    const b1 = yield s1.commit({ time: now + 11 })
    const b2 = yield s1.commit({ time: now + 22 })
    yield s2.writeBlock(b0)
    yield s2.writeBlock(b1)
    yield s2.writeBlock(b2)
    yield toolbox.serverWaitBlock(s2, 2)
  }))

  it('should exist the same block on each node', () => co(function*() {
    yield s1.expectJSON('/blockchain/current', {
      number: 2
    })
    yield s2.expectJSON('/blockchain/current', {
      number: 2
    })
  }))

  it('should refuse known fork blocks', () => co(function*() {
    const p1 = yield s1.getPeer()
    // Trigger the multiple writings in parallel
    const res = yield Promise.all([
      s2.writePeer(p1).then(p => p).catch(e => { assert.equal(e.uerr.message, "Document already under treatment"); return null }),
      s2.writePeer(p1).then(p => p).catch(e => { assert.equal(e.uerr.message, "Document already under treatment"); return null }),
      s2.writePeer(p1).then(p => p).catch(e => { assert.equal(e.uerr.message, "Document already under treatment"); return null }),
      s2.writePeer(p1).then(p => p).catch(e => { assert.equal(e.uerr.message, "Document already under treatment"); return null }),
      s2.writePeer(p1).then(p => p).catch(e => { assert.equal(e.uerr.message, "Document already under treatment"); return null }),
      s2.writePeer(p1).then(p => p).catch(e => { assert.equal(e.uerr.message, "Document already under treatment"); return null })
    ])

    assert.notEqual(res[0], null)
    assert.equal(res[1], null)
    assert.equal(res[2], null)
    assert.equal(res[3], null)
    assert.equal(res[4], null)
    assert.equal(res[5], null)

  }))

})
