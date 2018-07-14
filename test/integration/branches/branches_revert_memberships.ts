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
import {FullIindexEntry} from "../../../app/lib/indexer"

const should    = require('should');

let s1:TestingServer, i1:TestUser, i2:TestUser, i3:TestUser

describe("Revert memberships", function() {

  const now = 1482000000;

  before(async () => {

    s1 = NewTestingServer({
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

    await s1.initDalBmaConnections();

    await i1.createIdentity();
    await i2.createIdentity();

    await i1.cert(i2);
    await i2.cert(i1);

    await i1.join();
    await i2.join();

    await s1.commit({ time: now });
    await s1.expect('/blockchain/current', (res:any) => { res.number.should.equal(0); (res.medianTime - now).should.equal(0); });
    await s1.commit({ time: now + 15 });
    await s1.expect('/blockchain/current', (res:any) => { res.number.should.equal(1); (res.medianTime - now).should.equal(0); });

    await shouldHavePendingMS(0);
    await i3.createIdentity();
    await i1.cert(i3);
    await shouldBeFreshlyCreated();
    await i3.join();
    await shouldHavePendingMS(1);
    await shouldBeJoining();
    await s1.commit({ time: now + 15 });
    await s1.expect('/blockchain/current', (res:any) => { res.number.should.equal(2); (res.medianTime - now).should.equal(7); });
    await shouldHaveJoined();
    await shouldHavePendingMS(0);
  })

  it('should exist 3 members', async () => s1.expect('/blockchain/current', (res:any) => {
    res.should.have.property('membersCount').equal(3);
  }))

  it('should exist a renew', async () => {
    await i3.join(); // Renew
    await shouldHavePendingMS(1);
    await s1.commit({ time: now + 15 });
    await s1.expect('/blockchain/current', (res:any) => { res.number.should.equal(3); (res.medianTime - now).should.equal(10); });
    await s1.expect('/blockchain/current', (res:any) => {
      res.should.have.property('membersCount').equal(3);
      res.should.have.property('actives').length(1);
    });
    await shouldBeRenewed();
    await shouldHavePendingMS(0);
  })

  it('should exist 2 other renew', async () => {
    await s1.commit({ time: now + 15 });
    // await s1.expect('/blockchain/current', (res) => { res.number.should.equal(4); (res.medianTime - now).should.equal(11); });
    await i1.join(); // Renew
    await i2.join(); // Renew
    await shouldHavePendingMS(2);
    await s1.commit({ time: now + 15 });
    // await s1.expect('/blockchain/current', (res) => { res.number.should.equal(5); (res.medianTime - now).should.equal(21); });
    await s1.expect('/blockchain/current', (res:any) => {
      res.should.have.property('membersCount').equal(3);
      res.should.have.property('actives').length(2);
    });
    await shouldBeRenewed();
    await shouldHavePendingMS(0);
  })

  it('should exist a leaver', async () => {
    await i3.leave();
    await s1.commit({ time: now + 80 });
    await s1.expect('/blockchain/current', (res:any) => {
      // (res.medianTime - now).should.equal(27);
      res.should.have.property('membersCount').equal(3);
      res.should.have.property('leavers').length(1);
    });
    await shouldBeLeaving();
    await shouldHavePendingMS(0);
  })

  it('should exist a kicked member', async () => {
    await s1.commit({ time: now + 25 });
    // await s1.expect('/blockchain/current', (res) => { res.number.should.equal(7); (res.medianTime - now).should.equal(25); });
    // await s1.commit({ time: now + 30 });
    // await s1.expect('/blockchain/current', (res) => { res.number.should.equal(8); (res.medianTime - now).should.equal(18); });
    await shouldBeBeingKicked();
    await s1.commit({ time: now + 30 });
    await s1.expect('/blockchain/current', (res:any) => {
      res.should.have.property('membersCount').equal(2);
      res.should.have.property('excluded').length(1);
    });
    // Should:
    // * unset "to be kicked"
    // * not be a member anymore
    await shouldHaveBeenKicked();
    await shouldHavePendingMS(0);
  })

  it('a kicked member should be able to join back', async () => {
    await i3.join();
    await s1.commit({ time: now + 30 });
    await shouldHaveComeBack();
    await shouldHavePendingMS(0);
  })

  it('revert the join back', async () => {
    await s1.revert();
    await shouldHaveBeenKicked();
    await shouldHavePendingMS(0); // Undone memberships are lost
  })

  it('revert excluded member', async () => {
    await s1.revert();
    await shouldBeBeingKicked();
    await shouldHavePendingMS(0); // Undone memberships are lost
  })

  it('revert being kicked', async () => {
    await s1.revert();
    await shouldBeLeaving();
    await shouldHavePendingMS(0); // Undone memberships are lost
  })

  it('revert leaving', async () => {
    await s1.revert();
    await shouldBeRenewed();
    await shouldHavePendingMS(0); // Undone memberships are lost
  })

  it('revert 2 neutral blocks for i3', async () => {
    await s1.revert();
    await shouldBeRenewed();
    await shouldHavePendingMS(0); // Undone memberships are lost
    await s1.revert();
    await shouldBeRenewed();
    await shouldHavePendingMS(0); // Undone memberships are lost
  })

  it('revert renewal block', async () => {
    await s1.revert();
    await shouldHaveJoined();
    await shouldHavePendingMS(0); // Undone memberships are lost
  })

  it('revert join block', async () => {
    await s1.revert();
    await shouldHavePendingMS(0); // Undone memberships are lost
  })

  after(async () => {
    return s1.closeCluster()
  })

  /*********
   *
   * Identity state testing functions
   *
   ********/

  async function shouldHavePendingMS(number:number) {
    const pendingIN = await s1.dal.msDAL.getPendingIN();
    const pendingOUT = await s1.dal.msDAL.getPendingOUT();
    pendingIN.concat(pendingOUT).should.have.length(number);
  }

  async function shouldBeFreshlyCreated() {
    const idty = (await s1.dal.idtyDAL.searchThoseMatching(i3.pub))[0];
    idty.should.have.property('wasMember').equal(false);
    idty.should.have.property('written').equal(false);
    idty.should.have.property('kick').equal(false);
    idty.should.have.property('member').equal(false);
  }

  async function shouldBeJoining() {
    return shouldBeFreshlyCreated();
  }

  async function shouldHaveJoined() {
    const idty = await s1.dal.iindexDAL.getFromPubkey(i3.pub) as FullIindexEntry
    idty.should.have.property('wasMember').equal(true);
    idty.should.have.property('kick').equal(false);
    idty.should.have.property('member').equal(true);
  }

  async function shouldBeRenewed() {
    const idty = await s1.dal.iindexDAL.getFromPubkey(i3.pub) as FullIindexEntry
    idty.should.have.property('wasMember').equal(true);
    idty.should.have.property('kick').equal(false);
    idty.should.have.property('member').equal(true);
  }

  async function shouldBeLeaving() {
    const idty = await s1.dal.iindexDAL.getFromPubkey(i3.pub) as FullIindexEntry
    idty.should.have.property('wasMember').equal(true);
    idty.should.have.property('kick').equal(false);
    idty.should.have.property('member').equal(true);
  }

  async function shouldBeBeingKicked() {
    // Should be set as kicked now
    const idty = await s1.dal.iindexDAL.getFromPubkey(i3.pub) as FullIindexEntry
    idty.should.have.property('wasMember').equal(true);
    idty.should.have.property('kick').equal(true);
    idty.should.have.property('member').equal(true);
  }

  async function shouldHaveBeenKicked() {
    const idty = await s1.dal.iindexDAL.getFromPubkey(i3.pub) as FullIindexEntry
    idty.should.have.property('wasMember').equal(true);
    idty.should.have.property('kick').equal(false);
    idty.should.have.property('member').equal(false);
  }

  async function shouldHaveComeBack() {
    let idty = await s1.dal.iindexDAL.getFromPubkey(i3.pub) as FullIindexEntry
    idty.should.have.property('wasMember').equal(true);
    idty.should.have.property('kick').equal(false);
    idty.should.have.property('member').equal(true);
  }
});
