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

describe("Transaction chaining", function() {

  const now = 1456644632;

  const s1 = toolbox.server({
    pair: {
      pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV',
      sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'
    },
    dt: 3600,
    ud0: 1200,
    c: 0.1
  });

  const tic = user('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });
  const toc = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });

  before(() => co(function*() {

    yield s1.initWithDAL().then(bma).then((bmapi) => bmapi.openConnections());
    yield tic.createIdentity();
    yield toc.createIdentity();
    yield tic.cert(toc);
    yield toc.cert(tic);
    yield tic.join();
    yield toc.join();
    yield s1.commit({ time: now });
    yield s1.commit({ time: now + 7210 });
    yield s1.commit({ time: now + 7210 });
  }));

  describe("Sources", function(){

    it('it should exist block#2 with UD of 1200', () => s1.expect('/blockchain/block/2', (block) => {
      should.exists(block);
      assert.equal(block.number, 2);
      assert.equal(block.dividend, 1200);
    }));
  });

  describe("Chaining", function(){

    it('with SIG and XHX', () => co(function *() {
      // Current state
      let current = yield s1.get('/blockchain/current');
      (yield s1.get('/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo')).should.have.property('sources').length(1);
      let tx1 = yield toc.prepareITX(1040, tic); // Rest = 1200 - 1040 = 160
      let tx2 = yield toc.prepareUTX(tx1, ['SIG(0)'], [{ qty: 160, base: 0, lock: 'SIG(' + tic.pub + ')' }], {
        comment: 'also take the remaining 160 units',
        blockstamp: [current.number, current.hash].join('-'),
        theseOutputsStart: 1
      });
      const tmp = constants.TRANSACTION_MAX_TRIES = 2;
      constants.TRANSACTION_MAX_TRIES = 2;
      yield unit.shouldNotFail(toc.sendTX(tx1));
      yield unit.shouldNotFail(toc.sendTX(tx2));
      (yield s1.get('/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo')).should.have.property('sources').length(1);
      (yield s1.get('/tx/sources/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV')).should.have.property('sources').length(1);
      yield s1.commit({ time: now + 7210 }); // TX1 commited
      (yield s1.get('/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo')).should.have.property('sources').length(1); // The 160 remaining units
      (yield s1.get('/tx/sources/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV')).should.have.property('sources').length(2); // The UD + 1040 units sent by toc
      yield s1.commit({ time: now + 7210 }); // TX2 commited
      (yield s1.get('/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo')).should.have.property('sources').length(0);
      (yield s1.get('/tx/sources/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV')).should.have.property('sources').length(3); // The UD + 1040 + 160 units sent by toc
      constants.TRANSACTION_MAX_TRIES = tmp;
    }));
  });
});
