"use strict";

var co = require('co');
var _ = require('underscore');
var should = require('should');
var assert = require('assert');
var constants = require('../../app/lib/constants');
var node   = require('./tools/node');
var user   = require('./tools/user');
var unit   = require('./tools/unit');
var MEMORY_MODE = true;

describe("Testing transactions", function() {

  var node2 = node({ name: 'db2', memory: MEMORY_MODE }, { currency: 'cc', ipv4: 'localhost', port: 9998, remoteipv4: 'localhost', remoteport: 9998, upnp: false, httplogs: false,
    pair: {
      pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV',
      sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'
    },
    forksize: 3,
    participate: false, rootoffset: 10,
    sigQty: 1, dt: 0, ud0: 120
  });

  var tic = user('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, node2);
  var toc = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, node2);

  before(function() {
    return node2.startTesting()
      .then(function(){
        return co(function *() {
          // Self certifications
          yield tic.selfCertP();
          yield toc.selfCertP();
          // Certification;
          yield tic.certP(toc);
          yield toc.certP(tic);
          yield tic.joinP();
          yield toc.joinP();
          yield node2.commitP();
          yield node2.commitP();
          yield tic.sendP(51, toc);
          yield node2.commitP();
        });
      });
  });
  after(node2.after());

  describe("Sources", function(){

    it('it should exist block#2 with UD of 120', node2.block(2, function(block, done){
      should.exists(block);
      assert.equal(block.number, 2);
      assert.equal(block.dividend, 120);
      done();
    }));

    it('tic should be able to send 51 to toc', node2.sourcesOf('DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', function(res, done){
      should.exists(res);
      assert.equal(res.sources.length, 2);
      var txSrc = _.findWhere(res.sources, { type: 'T' });
      var udSrc = _.findWhere(res.sources, { type: 'D' });
      assert.equal(txSrc.amount, 69);
      assert.equal(udSrc.amount, 120);
      done();
    }));

    it('toc should have 151 of sources', node2.sourcesOf('DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', function(res, done){
      should.exists(res);
      assert.equal(res.sources.length, 3);
      var txRes = _.findWhere(res.sources, { type: 'T' });
      var duRes = _.filter(res.sources, { type: 'D' });
      assert.equal(txRes.type, 'T');
      assert.equal(txRes.amount, 51);
      assert.equal(duRes[0].type, 'D');
      assert.equal(duRes[0].amount, 120);
      assert.equal(duRes[1].type, 'D');
      assert.equal(duRes[1].amount, 120);
      done();
    }));

    it('toc should be able to send 80 to tic', () => co(function *() {
      let tx1 = yield toc.prepareITX(291, tic);
      yield toc.sendTX(tx1);
      yield node2.commitP();
      let res = yield node2.sourcesOfP('DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo');
      should.exists(res);
      assert.equal(res.sources.length, 1);
      var duRes = _.filter(res.sources, { type: 'D' });
      assert.equal(duRes[0].type, 'D');
      assert.equal(duRes[0].amount, 120);
    }));
  });

  describe("Chaining", function(){

    it('with SIG and XHX', () => co(function *() {
      let tx1 = yield toc.prepareITX(120, tic);
      yield toc.sendTX(tx1);
      yield node2.commitP();
      let tx2 = yield tic.prepareUTX(tx1, ['SIG(2)'], [{ qty: 120, base: 0, lock: 'SIG(' + toc.pub + ')' }], { comment: 'wrong'});
      let tx3 = yield tic.prepareUTX(tx1, ['SIG(1)'], [{ qty: 120, base: 0, lock: 'SIG(' + toc.pub + ')' }], { comment: 'wrong'});
      let tx4 = yield tic.prepareUTX(tx1, ['SIG(0)'], [{ qty: 120, base: 0, lock: 'XHX(8AFC8DF633FC158F9DB4864ABED696C1AA0FE5D617A7B5F7AB8DE7CA2EFCD4CB)' }], { comment: 'ok'});
      let tx5 = yield tic.prepareUTX(tx1, ['XHX(2)'], [{ qty: 120, base: 0, lock: 'SIG(' + toc.pub + ')' }], { comment: 'wrong'});
      let tx6 = yield tic.prepareUTX(tx1, ['XHX(4)'], [{ qty: 120, base: 0, lock: 'SIG(' + toc.pub + ')' }], { comment: 'wrong'});
      yield unit.shouldFail(toc.sendTX(tx2), 'Wrong unlocker in transaction');
      yield unit.shouldFail(toc.sendTX(tx3), 'Wrong unlocker in transaction');
      yield unit.shouldNotFail(toc.sendTX(tx4));
      yield unit.shouldFail(toc.sendTX(tx5), 'Wrong unlocker in transaction');
      yield unit.shouldFail(toc.sendTX(tx6), 'Wrong unlocker in transaction');
      yield node2.commitP(); // TX4 commited
      let tx7 = yield tic.prepareUTX(tx4, ['XHX(2872767826647264)'], [{ qty: 120, base: 0, lock: 'SIG(' + toc.pub + ')' }], { comment: 'wrong1'});
      let tx8 = yield tic.prepareUTX(tx4, ['XHX(1872767826647264)'], [{ qty: 120, base: 0, lock: 'SIG(' + toc.pub + ')' }], { comment: 'okk'});
      yield unit.shouldFail(toc.sendTX(tx7), 'Wrong unlocker in transaction');
      yield unit.shouldNotFail(toc.sendTX(tx8));
      yield node2.commitP(); // TX4 commited
    }));

    it('with MULTISIG', () => co(function *() {
      let tx1 = yield toc.prepareITX(120, tic);
      yield toc.sendTX(tx1);
      yield node2.commitP();
      // The funding transaction that can be reverted by its issuer (tic here) or consumed by toc if he knowns X for H(X)
      let tx2 = yield tic.prepareUTX(tx1, ['SIG(0)'], [{ qty: 120, base: 0, lock: '(XHX(8AFC8DF633FC158F9DB4864ABED696C1AA0FE5D617A7B5F7AB8DE7CA2EFCD4CB) && SIG(' + toc.pub + ')) || (SIG(' + tic.pub + ') && SIG(' + toc.pub + '))'  }], { comment: 'cross1' });
      yield unit.shouldNotFail(toc.sendTX(tx2));
      yield node2.commitP(); // TX2 commited
      let tx3 = yield tic.prepareUTX(tx2, ['XHX(1872767826647264) SIG(0)'], [{ qty: 120, base: 0, lock: 'SIG(' + toc.pub + ')' }], { comment: 'wrong'});
      let tx4 = yield toc.prepareUTX(tx2, ['XHX(1872767826647264) SIG(0)'], [{ qty: 120, base: 0, lock: 'SIG(' + toc.pub + ')' }], { comment: 'ok'});
      let tx5 = yield tic.prepareMTX(tx2, toc, ['XHX(1872767826647264) SIG(1) SIG(0)'], [{ qty: 120, base: 0, lock: 'SIG(' + toc.pub + ')' }], { comment: 'multi OK'});
      let tx6 = yield toc.prepareMTX(tx2, tic, ['XHX(1872767826647264) SIG(1) SIG(0)'], [{ qty: 120, base: 0, lock: 'SIG(' + toc.pub + ')' }], { comment: 'multi WRONG'});
      // nLocktime
      let tx7 = yield tic.prepareMTX(tx2, toc, ['XHX(1872767826647264) SIG(1) SIG(0)'], [{ qty: 120, base: 0, lock: 'SIG(' + toc.pub + ')' }], { comment: 'wrong locktime', locktime: 100 });
      yield unit.shouldFail(toc.sendTX(tx3), 'Wrong unlocker in transaction');
      yield unit.shouldNotFail(toc.sendTX(tx4));
      yield unit.shouldNotFail(toc.sendTX(tx5));
      yield unit.shouldFail(toc.sendTX(tx6), 'Wrong unlocker in transaction');
      yield unit.shouldFail(toc.sendTX(tx7), 'Locktime not elapsed yet');
    }));
  });
});
