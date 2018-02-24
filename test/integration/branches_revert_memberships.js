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
const should    = require('should');
const bma       = require('../../app/modules/bma').BmaDependency.duniter.methods.bma;
const TestUser  = require('./tools/TestUser').TestUser
const commit    = require('./tools/commit');
const toolbox   = require('./tools/toolbox');

let s1, i1, i2, i3

describe("Revert memberships", function() {

  const now = 1482000000;

  before(() => co(function*() {

    s1 = toolbox.server({
      memory: true,
      msValidity: 14,
      pair: {
        pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
        sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
      }
    });

    i1 = new TestUser('i1',   { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
    i2 = new TestUser('i2',   { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });
    i3 = new TestUser('i3',   { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });

    yield s1.initDalBmaConnections();

    yield i1.createIdentity();
    yield i2.createIdentity();

    yield i1.cert(i2);
    yield i2.cert(i1);

    yield i1.join();
    yield i2.join();

    yield s1.commit({ time: now });
    yield s1.expect('/blockchain/current', (res) => { res.number.should.equal(0); (res.medianTime - now).should.equal(0); });
    yield s1.commit({ time: now + 15 });
    yield s1.expect('/blockchain/current', (res) => { res.number.should.equal(1); (res.medianTime - now).should.equal(0); });

    yield shouldHavePendingMS(0);
    yield i3.createIdentity();
    yield i1.cert(i3);
    yield shouldBeFreshlyCreated();
    yield i3.join();
    yield shouldHavePendingMS(1);
    yield shouldBeJoining();
    yield s1.commit({ time: now + 15 });
    yield s1.expect('/blockchain/current', (res) => { res.number.should.equal(2); (res.medianTime - now).should.equal(7); });
    yield shouldHaveJoined();
    yield shouldHavePendingMS(0);
  }));

  it('should exist 3 members', () => s1.expect('/blockchain/current', (res) => {
    res.should.have.property('membersCount').equal(3);
  }));

  it('should exist a renew', () => co(function*() {
    yield i3.join(); // Renew
    yield shouldHavePendingMS(1);
    yield s1.commit({ time: now + 15 });
    yield s1.expect('/blockchain/current', (res) => { res.number.should.equal(3); (res.medianTime - now).should.equal(10); });
    yield s1.expect('/blockchain/current', (res) => {
      res.should.have.property('membersCount').equal(3);
      res.should.have.property('actives').length(1);
    });
    yield shouldBeRenewed();
    yield shouldHavePendingMS(0);
  }));

  it('should exist 2 other renew', () => co(function*() {
    yield s1.commit({ time: now + 15 });
    // yield s1.expect('/blockchain/current', (res) => { res.number.should.equal(4); (res.medianTime - now).should.equal(11); });
    yield i1.join(); // Renew
    yield i2.join(); // Renew
    yield shouldHavePendingMS(2);
    yield s1.commit({ time: now + 15 });
    // yield s1.expect('/blockchain/current', (res) => { res.number.should.equal(5); (res.medianTime - now).should.equal(21); });
    yield s1.expect('/blockchain/current', (res) => {
      res.should.have.property('membersCount').equal(3);
      res.should.have.property('actives').length(2);
    });
    yield shouldBeRenewed();
    yield shouldHavePendingMS(0);
  }));

  it('should exist a leaver', () => co(function*() {
    yield i3.leave();
    yield s1.commit({ time: now + 80 });
    yield s1.expect('/blockchain/current', (res) => {
      // (res.medianTime - now).should.equal(27);
      res.should.have.property('membersCount').equal(3);
      res.should.have.property('leavers').length(1);
    });
    yield shouldBeLeaving();
    yield shouldHavePendingMS(0);
  }));

  it('should exist a kicked member', () => co(function*() {
    yield s1.commit({ time: now + 25 });
    // yield s1.expect('/blockchain/current', (res) => { res.number.should.equal(7); (res.medianTime - now).should.equal(25); });
    // yield s1.commit({ time: now + 30 });
    // yield s1.expect('/blockchain/current', (res) => { res.number.should.equal(8); (res.medianTime - now).should.equal(18); });
    yield shouldBeBeingKicked();
    yield s1.commit({ time: now + 30 });
    yield s1.expect('/blockchain/current', (res) => {
      res.should.have.property('membersCount').equal(2);
      res.should.have.property('excluded').length(1);
    });
    // Should:
    // * unset "to be kicked"
    // * not be a member anymore
    yield shouldHaveBeenKicked();
    yield shouldHavePendingMS(0);
  }));

  it('a kicked member should be able to join back', () => co(function*() {
    yield i3.join();
    yield s1.commit({ time: now + 30 });
    yield shouldHaveComeBack();
    yield shouldHavePendingMS(0);
  }));

  it('revert the join back', () => co(function*() {
    yield s1.revert();
    yield shouldHaveBeenKicked();
    yield shouldHavePendingMS(0); // Undone memberships are lost
  }));

  it('revert excluded member', () => co(function*() {
    yield s1.revert();
    yield shouldBeBeingKicked();
    yield shouldHavePendingMS(0); // Undone memberships are lost
  }));

  it('revert being kicked', () => co(function*() {
    yield s1.revert();
    yield shouldBeLeaving();
    yield shouldHavePendingMS(0); // Undone memberships are lost
  }));

  it('revert leaving', () => co(function*() {
    yield s1.revert();
    yield shouldBeRenewed();
    yield shouldHavePendingMS(0); // Undone memberships are lost
  }));

  it('revert 2 neutral blocks for i3', () => co(function*() {
    yield s1.revert();
    yield shouldBeRenewed();
    yield shouldHavePendingMS(0); // Undone memberships are lost
    yield s1.revert();
    yield shouldBeRenewed();
    yield shouldHavePendingMS(0); // Undone memberships are lost
  }));

  it('revert renewal block', () => co(function*() {
    yield s1.revert();
    yield shouldHaveJoined();
    yield shouldHavePendingMS(0); // Undone memberships are lost
  }));

  it('revert join block', () => co(function*() {
    yield s1.revert();
    yield shouldHavePendingMS(0); // Undone memberships are lost
  }));

  after(() => {
    return s1.closeCluster()
  })

  /*********
   *
   * Identity state testing functions
   *
   ********/

  function shouldHavePendingMS(number) {
    return co(function*() {
      const pendingIN = yield s1.dal.msDAL.getPendingIN();
      const pendingOUT = yield s1.dal.msDAL.getPendingOUT();
      pendingIN.concat(pendingOUT).should.have.length(number);
    });
  }

  function shouldBeFreshlyCreated() {
    return co(function*() {
      const idty = (yield s1.dal.idtyDAL.searchThoseMatching(i3.pub))[0];
      idty.should.have.property('wasMember').equal(false);
      idty.should.have.property('written').equal(false);
      idty.should.have.property('kick').equal(false);
      idty.should.have.property('member').equal(false);
    });
  }

  function shouldBeJoining() {
    return shouldBeFreshlyCreated();
  }

  function shouldHaveJoined() {
    return co(function*() {
      const idty = yield s1.dal.iindexDAL.getFromPubkey(i3.pub);
      idty.should.have.property('wasMember').equal(true);
      idty.should.have.property('kick').equal(false);
      idty.should.have.property('member').equal(true);
    });
  }

  function shouldBeRenewed() {
    return co(function*() {
      const idty = yield s1.dal.iindexDAL.getFromPubkey(i3.pub);
      idty.should.have.property('wasMember').equal(true);
      idty.should.have.property('kick').equal(false);
      idty.should.have.property('member').equal(true);
    });
  }

  function shouldBeLeaving() {
    return co(function*() {
      const idty = yield s1.dal.iindexDAL.getFromPubkey(i3.pub);
      idty.should.have.property('wasMember').equal(true);
      idty.should.have.property('kick').equal(false);
      idty.should.have.property('member').equal(true);
    });
  }

  function shouldBeBeingKicked() {
    return co(function*() {
      // Should be set as kicked now
      const idty = yield s1.dal.iindexDAL.getFromPubkey(i3.pub);
      idty.should.have.property('wasMember').equal(true);
      idty.should.have.property('kick').equal(true);
      idty.should.have.property('member').equal(true);
    });
  }

  function shouldHaveBeenKicked() {
    return co(function*() {
      const idty = yield s1.dal.iindexDAL.getFromPubkey(i3.pub);
      idty.should.have.property('wasMember').equal(true);
      idty.should.have.property('kick').equal(false);
      idty.should.have.property('member').equal(false);
    });
  }

  function shouldHaveComeBack() {
    return co(function*() {
      let idty = yield s1.dal.iindexDAL.getFromPubkey(i3.pub);
      idty.should.have.property('wasMember').equal(true);
      idty.should.have.property('kick').equal(false);
      idty.should.have.property('member').equal(true);
    });
  }
});
