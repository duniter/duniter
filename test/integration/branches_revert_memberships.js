"use strict";

const co        = require('co');
const should    = require('should');
const bma       = require('../../app/lib/streams/bma');
const user      = require('./tools/user');
const commit    = require('./tools/commit');
const until     = require('./tools/until');
const toolbox   = require('./tools/toolbox');
const limiter   = require('../../app/lib/system/limiter');
const multicaster = require('../../app/lib/streams/multicaster');

const s1 = toolbox.server({
  memory: true,
  msValidity: 14,
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  }
});

const i1 = user('i1',   { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
const i2 = user('i2',   { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });
const i3 = user('i3',   { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });

describe("Revert memberships", function() {

  const now = Math.round(Date.now() / 1000);

  before(() => co(function*() {

    limiter.noLimit();

    yield s1.initWithDAL().then(bma).then((bmapi) => bmapi.openConnections());

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
    yield s1.commit({ time: now + 55 });
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
    yield shouldHavePendingMS(1); // Keep track of undone membership
  }));

  it('revert excluded member', () => co(function*() {
    yield s1.revert();
    yield shouldBeBeingKicked();
    yield shouldHavePendingMS(1); // Keep track of undone membership
  }));

  it('revert being kicked', () => co(function*() {
    yield s1.revert();
    yield shouldBeLeaving();
    yield shouldHavePendingMS(1); // Keep track of undone membership
  }));

  it('revert leaving', () => co(function*() {
    yield s1.revert();
    yield shouldBeRenewed();
    yield shouldHavePendingMS(2); // Keep track of undone membership
  }));

  it('revert 2 neutral blocks for i3', () => co(function*() {
    yield s1.revert();
    yield shouldBeRenewed();
    yield shouldHavePendingMS(4); // Keep track of undone membership
    yield s1.revert();
    yield shouldBeRenewed();
    yield shouldHavePendingMS(4); // Keep track of undone membership
  }));

  it('revert renewal block', () => co(function*() {
    yield s1.revert();
    yield shouldHaveJoined();
    yield shouldHavePendingMS(5); // Keep track of undone membership
  }));

  it('revert join block', () => co(function*() {
    yield s1.revert();
    yield shouldBeJoining();
    yield shouldHavePendingMS(6); // Keep track of undone membership
  }));

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
      idty.should.have.property('currentMSN').equal(-1);
      idty.should.have.property('currentINN').equal(-1);
      idty.should.have.property('wasMember').equal(false);
      idty.should.have.property('written').equal(false);
      idty.should.have.property('kick').equal(false);
      idty.should.have.property('member').equal(false);
      idty.should.have.property('leaving').equal(false);
    });
  }

  function shouldBeJoining() {
    return shouldBeFreshlyCreated();
  }

  function shouldHaveJoined() {
    return co(function*() {
      const idty = yield s1.dal.idtyDAL.getFromPubkey(i3.pub);
      idty.should.have.property('currentMSN').equal(1);
      idty.should.have.property('currentINN').equal(1);
      idty.should.have.property('wasMember').equal(true);
      idty.should.have.property('written').equal(true);
      idty.should.have.property('kick').equal(false);
      idty.should.have.property('member').equal(true);
      idty.should.have.property('leaving').equal(false);
    });
  }

  function shouldBeRenewed() {
    return co(function*() {
      const idty = yield s1.dal.idtyDAL.getFromPubkey(i3.pub);
      idty.should.have.property('currentMSN').equal(2);
      idty.should.have.property('currentINN').equal(2);
      idty.should.have.property('wasMember').equal(true);
      idty.should.have.property('written').equal(true);
      idty.should.have.property('kick').equal(false);
      idty.should.have.property('member').equal(true);
      idty.should.have.property('leaving').equal(false);
    });
  }

  function shouldBeLeaving() {
    return co(function*() {
      const idty = yield s1.dal.idtyDAL.getFromPubkey(i3.pub);
      idty.should.have.property('currentMSN').equal(5);
      idty.should.have.property('currentINN').equal(2);
      idty.should.have.property('wasMember').equal(true);
      idty.should.have.property('written').equal(true);
      idty.should.have.property('kick').equal(false);
      idty.should.have.property('member').equal(true);
      idty.should.have.property('leaving').equal(true);
    });
  }

  function shouldBeBeingKicked() {
    return co(function*() {
      // Should be set as kicked bow
      const idty = yield s1.dal.idtyDAL.getFromPubkey(i3.pub);
      idty.should.have.property('currentMSN').equal(5);
      idty.should.have.property('currentINN').equal(2);
      idty.should.have.property('wasMember').equal(true);
      idty.should.have.property('written').equal(true);
      idty.should.have.property('kick').equal(true);
      idty.should.have.property('member').equal(true);
      idty.should.have.property('leaving').equal(true);
    });
  }

  function shouldHaveBeenKicked() {
    return co(function*() {
      const idty = yield s1.dal.idtyDAL.getFromPubkey(i3.pub);
      idty.should.have.property('currentMSN').equal(5);
      idty.should.have.property('currentINN').equal(2);
      idty.should.have.property('wasMember').equal(true);
      idty.should.have.property('written').equal(true);
      idty.should.have.property('kick').equal(false);
      idty.should.have.property('member').equal(false);
      idty.should.have.property('leaving').equal(true);
    });
  }

  function shouldHaveComeBack() {
    return co(function*() {
      let idty = yield s1.dal.idtyDAL.getFromPubkey(i3.pub);
      idty.should.have.property('currentMSN').equal(8);
      idty.should.have.property('currentINN').equal(8);
      idty.should.have.property('wasMember').equal(true);
      idty.should.have.property('written').equal(true);
      idty.should.have.property('kick').equal(false);
      idty.should.have.property('member').equal(true);
      idty.should.have.property('leaving').equal(false);
    });
  }
});
