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
import {BmaDependency} from "../../../app/modules/bma/index"
import {Underscore} from "../../../app/lib/common-libs/underscore"
import {NewTestingServer, TestingServer} from "../tools/toolbox"
import {HttpBlock} from "../../../app/modules/bma/lib/dtos"

const should    = require('should');
const rp        = require('request-promise');
const httpTest  = require('../tools/http');
const shutDownEngine  = require('../tools/shutDownEngine');

const expectAnswer   = httpTest.expectAnswer;

const MEMORY_MODE = true;
const commonConf = {
  ipv4: '127.0.0.1',
  currency: 'bb',
  xpercent: 0.9,
  sigPeriod: 200, // every 200 seconds
  msValidity: 10000,
  sigQty: 1
};

let s1:TestingServer, cat:TestUser, tac:TestUser, tic:TestUser, toc:TestUser

describe("Certification chainability", function() {

  before(async () => {

    s1 = NewTestingServer(
      Underscore.extend({
        name: 'bb11',
        memory: MEMORY_MODE,
        port: '9225',
        pair: {
          pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
          sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
        }
      }, commonConf));

    cat = new TestUser('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
    tac = new TestUser('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, { server: s1 });
    toc = new TestUser('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });
    tic = new TestUser('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });

    const now = 1482220000;

    /**
     * tac <===> cat
     */
    await s1.initWithDAL().then(BmaDependency.duniter.methods.bma).then((bmapi) => bmapi.openConnections());
    await cat.createIdentity();
    await tac.createIdentity();
    await cat.cert(tac);
    await tac.cert(cat);
    await cat.join();
    await tac.join();
    await s1.commit({ time: now });
    await s1.commit({
      time: now + 399
    });

    // Should not happen on the first commit due to certPeriod
    await tic.createIdentity();
    await tic.join();
    await cat.cert(tic);
    await s1.commit({ time: now + 199 });
    await s1.commit({ time: now + 199 });
    // We still are at +199, and the certPeriod must be OVER (or equal to) current time to allow new certs from cat.
    // So if we increment +1
    await s1.commit({
      time: now + 300
    });
    await s1.commit({
      time: now + 300
    });
    // Should be integrated now
    await s1.commit({ time: now + 300 });
  });

  after(() => {
    return Promise.all([
      shutDownEngine(s1)
    ])
  })

  it('block 0 should have 2 certs', function() {
    return expectAnswer(rp('http://127.0.0.1:9225/blockchain/block/0', { json: true }), function(res:HttpBlock) {
      res.should.have.property('number').equal(0);
      res.should.have.property('certifications').length(2);
    });
  });

  it('block 1 should have 0 certs', function() {
    return expectAnswer(rp('http://127.0.0.1:9225/blockchain/block/1', { json: true }), function(res:HttpBlock) {
      res.should.have.property('number').equal(1);
      res.should.have.property('certifications').length(0);
    });
  });

  it('block 2 should have 0 certs', function() {
    return expectAnswer(rp('http://127.0.0.1:9225/blockchain/block/2', { json: true }), function(res:HttpBlock) {
      res.should.have.property('number').equal(2);
      res.should.have.property('certifications').length(0);
    });
  });

  it('block 3 should have 0 certs', function() {
    return expectAnswer(rp('http://127.0.0.1:9225/blockchain/block/3', { json: true }), function(res:HttpBlock) {
      res.should.have.property('number').equal(3);
      res.should.have.property('certifications').length(0);
    });
  });

  it('block 4 should have 0 certs', function() {
    return expectAnswer(rp('http://127.0.0.1:9225/blockchain/block/4', { json: true }), function(res:HttpBlock) {
      res.should.have.property('number').equal(4);
      res.should.have.property('certifications').length(0);
    });
  });

  it('block 5 should have 0 certs', function() {
    return expectAnswer(rp('http://127.0.0.1:9225/blockchain/block/5', { json: true }), function(res:HttpBlock) {
      res.should.have.property('number').equal(5);
      res.should.have.property('certifications').length(0);
    });
  });

  it('block 6 should have 1 certs', function() {
    return expectAnswer(rp('http://127.0.0.1:9225/blockchain/block/6', { json: true }), function(res:HttpBlock) {
      res.should.have.property('number').equal(6);
      res.should.have.property('certifications').length(1);
    });
  });
});
