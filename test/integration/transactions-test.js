"use strict";

const co = require('co');
const _ = require('underscore');
const should = require('should');
const assert = require('assert');
const constants = require('../../app/lib/constants');
const bma       = require('duniter-bma').duniter.methods.bma;
const toolbox   = require('./tools/toolbox');
const node   = require('./tools/node');
const user   = require('./tools/user');
const unit   = require('./tools/unit');
const http   = require('./tools/http');


describe("Testing transactions", function() {

  let now;

  const s1 = toolbox.server({
    pair: {
      pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV',
      sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'
    },
    dt: 3600,
    ud0: 1200
  });

  const tic = user('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });
  const toc = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });

  before(() => co(function*() {

    now = Math.round(new Date().getTime() / 1000);

    yield s1.initWithDAL().then(bma).then((bmapi) => bmapi.openConnections());
    // Self certifications
    yield tic.createIdentity();
    yield toc.createIdentity();
    // Certification;
    yield tic.cert(toc);
    yield toc.cert(tic);
    yield tic.join();
    yield toc.join();
    yield s1.commit();
    yield s1.commit({
      time: now + 7210
    });
    yield s1.commit({
      time: now + 7210
    });
    yield tic.sendP(510, toc);
    yield s1.expect('/tx/history/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', (res) => {
      res.should.have.property('pubkey').equal('DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo');
      res.should.have.property('history').property('pending').length(1);
      res.history.pending[0].should.have.property('received').be.a.Number;
    });
    yield s1.commit({
      time: now + 7220
    });
  }));

  describe("Sources", function(){

    it('it should exist block#2 with UD of 1200', () => s1.expect('/blockchain/block/2', (block) => {
      should.exists(block);
      assert.equal(block.number, 2);
      assert.equal(block.dividend, 1200);
    }));

    it('tic should be able to send 510 to toc', () => s1.expect('/tx/sources/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', (res) => {
      should.exists(res);
      assert.equal(res.sources.length, 1);
      const txSrc = _.findWhere(res.sources, { type: 'T' });
      assert.equal(txSrc.amount, 690);
    }));

    it('toc should have 1510 of sources', () => s1.expect('/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', (res) => {
      should.exists(res);
      assert.equal(res.sources.length, 2);
      const txRes = _.findWhere(res.sources, { type: 'T' });
      const duRes = _.filter(res.sources, { type: 'D' });
      assert.equal(txRes.type, 'T');
      assert.equal(txRes.amount, 510);
      assert.equal(duRes[0].type, 'D');
      assert.equal(duRes[0].amount, 1200);
    }));

    it('toc should be able to send 800 to tic', () => co(function *() {
      let tx1 = yield toc.prepareITX(1710, tic);
      yield toc.sendTX(tx1);
      yield s1.commit();
      (yield s1.get('/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo')).should.have.property('sources').length(0);
    }));
  });

  describe("Chaining", function(){

    it('with SIG and XHX', () => co(function *() {
      // Current state
      (yield s1.get('/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo')).should.have.property('sources').length(0);
      (yield s1.get('/tx/sources/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV')).should.have.property('sources').length(2);
      // Make the time go so another UD is available
      yield s1.commit({
        time: now + 19840
      });
      (yield s1.get('/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo')).should.have.property('sources').length(0);
      (yield s1.get('/tx/sources/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV')).should.have.property('sources').length(2);
      yield s1.commit();
      (yield s1.get('/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo')).should.have.property('sources').length(1);
      (yield s1.get('/tx/sources/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV')).should.have.property('sources').length(3);
      let tx1 = yield toc.prepareITX(1201, tic);
      yield toc.sendTX(tx1);
      yield s1.commit();
      (yield s1.get('/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo')).should.have.property('sources').length(0);
      (yield s1.get('/tx/sources/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV')).should.have.property('sources').length(4);
      // Now cat has all the money...
      let current = yield s1.get('/blockchain/current');
      let tx2 = yield tic.prepareUTX(tx1, ['SIG(2)'], [{ qty: 1201, base: 0, lock: 'SIG(' + toc.pub + ')' }], { comment: 'wrong', blockstamp: [current.number, current.hash].join('-') });
      let tx3 = yield tic.prepareUTX(tx1, ['SIG(1)'], [{ qty: 1201, base: 0, lock: 'SIG(' + toc.pub + ')' }], { comment: 'wrong', blockstamp: [current.number, current.hash].join('-') });
      let tx4 = yield tic.prepareUTX(tx1, ['SIG(0)'], [{ qty: 1201, base: 0, lock: 'XHX(8AFC8DF633FC158F9DB4864ABED696C1AA0FE5D617A7B5F7AB8DE7CA2EFCD4CB)' }], { comment: 'ok', blockstamp: [current.number, current.hash].join('-') });
      let tx5 = yield tic.prepareUTX(tx1, ['XHX(2)'], [{ qty: 1201, base: 0, lock: 'SIG(' + toc.pub + ')' }], { comment: 'wrong', blockstamp: [current.number, current.hash].join('-') });
      let tx6 = yield tic.prepareUTX(tx1, ['XHX(4)'], [{ qty: 1201, base: 0, lock: 'SIG(' + toc.pub + ')' }], { comment: 'wrong', blockstamp: [current.number, current.hash].join('-') });
      yield unit.shouldFail(toc.sendTX(tx2), 'Wrong unlocker in transaction');
      yield unit.shouldFail(toc.sendTX(tx3), 'Wrong unlocker in transaction');
      yield unit.shouldNotFail(toc.sendTX(tx4));
      yield unit.shouldFail(toc.sendTX(tx5), 'Wrong unlocker in transaction');
      yield unit.shouldFail(toc.sendTX(tx6), 'Wrong unlocker in transaction');
      yield s1.commit(); // TX4 commited
      (yield s1.get('/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo')).should.have.property('sources').length(0); // The tx was not sent to someone, but with an XHX! So toc has nothing more than before.
      (yield s1.get('/tx/sources/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV')).should.have.property('sources').length(3);
      let tx7 = yield tic.prepareUTX(tx4, ['XHX(2872767826647264)'], [{ qty: 1201, base: 0, lock: 'SIG(' + toc.pub + ')' }], { comment: 'wrong1', blockstamp: [current.number, current.hash].join('-') });
      let tx8 = yield tic.prepareUTX(tx4, ['XHX(1872767826647264)'], [{ qty: 1201, base: 0, lock: 'SIG(' + toc.pub + ')' }], { comment: 'okk', blockstamp: [current.number, current.hash].join('-') }); // tic unlocks the XHX locked amount, and gives it to toc!
      yield unit.shouldFail(toc.sendTX(tx7), 'Wrong unlocker in transaction');
      yield unit.shouldNotFail(toc.sendTX(tx8));
      yield s1.commit(); // TX8 commited
      (yield s1.get('/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo')).should.have.property('sources').length(1); // That's why toc now has 1 more source...
      (yield s1.get('/tx/sources/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV')).should.have.property('sources').length(3); // ...and why tic's number of sources hasn't changed
    }));

    it('with MULTISIG', () => co(function *() {
      (yield s1.get('/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo')).should.have.property('sources').length(1);
      (yield s1.get('/tx/sources/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV')).should.have.property('sources').length(3);
      let tx1 = yield toc.prepareITX(1201, tic);
      yield toc.sendTX(tx1);
      yield s1.commit();
      let current = yield s1.get('/blockchain/current');
      (yield s1.get('/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo')).should.have.property('sources').length(0);
      (yield s1.get('/tx/sources/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV')).should.have.property('sources').length(4);
      // The funding transaction that can be reverted by its issuer (tic here) or consumed by toc if he knowns X for H(X)
      let tx2 = yield tic.prepareUTX(tx1, ['SIG(0)'], [{ qty: 1201, base: 0, lock: '(XHX(8AFC8DF633FC158F9DB4864ABED696C1AA0FE5D617A7B5F7AB8DE7CA2EFCD4CB) && SIG(' + toc.pub + ')) || (SIG(' + tic.pub + ') && SIG(' + toc.pub + '))'  }], { comment: 'cross1', blockstamp: [current.number, current.hash].join('-') });
      yield unit.shouldNotFail(toc.sendTX(tx2));
      yield s1.commit(); // TX2 commited
      (yield s1.get('/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo')).should.have.property('sources').length(1); // toc is also present in the target of tx2
      (yield s1.get('/tx/sources/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV')).should.have.property('sources').length(4); // As well as tic
      let tx3 = yield tic.prepareUTX(tx2, ['XHX(1872767826647264) SIG(0)'], [{ qty: 1201, base: 0, lock: 'SIG(' + toc.pub + ')' }], { comment: 'wrong', blockstamp: [current.number, current.hash].join('-') });
      let tx4 = yield toc.prepareUTX(tx2, ['XHX(1872767826647264) SIG(0)'], [{ qty: 1201, base: 0, lock: 'SIG(' + toc.pub + ')' }], { comment: 'ok', blockstamp: [current.number, current.hash].join('-') });
      let tx5 = yield tic.prepareMTX(tx2, toc, ['XHX(1872767826647264) SIG(1) SIG(0)'], [{ qty: 1201, base: 0, lock: 'SIG(' + toc.pub + ')' }], { comment: 'multi OK', blockstamp: [current.number, current.hash].join('-') });
      let tx6 = yield toc.prepareMTX(tx2, tic, ['XHX(1872767826647264) SIG(1) SIG(0)'], [{ qty: 1201, base: 0, lock: 'SIG(' + toc.pub + ')' }], { comment: 'multi WRONG', blockstamp: [current.number, current.hash].join('-') });
      // nLocktime
      let tx7 = yield tic.prepareMTX(tx2, toc, ['XHX(1872767826647264) SIG(1) SIG(0)'], [{ qty: 1201, base: 0, lock: 'SIG(' + toc.pub + ')' }], { comment: 'wrong locktime', locktime: 100, blockstamp: [current.number, current.hash].join('-') });
      yield unit.shouldFail(toc.sendTX(tx3), 'Wrong unlocker in transaction');
      yield unit.shouldNotFail(toc.sendTX(tx4));
      yield unit.shouldNotFail(toc.sendTX(tx5));
      yield unit.shouldFail(toc.sendTX(tx6), 'Wrong unlocker in transaction');
      yield unit.shouldFail(toc.sendTX(tx7), 'Locktime not elapsed yet');
    }));
  });
});
