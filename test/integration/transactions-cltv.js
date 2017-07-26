"use strict";

const co = require('co');
const _ = require('underscore');
const should = require('should');
const assert = require('assert');
const constants = require('../../app/lib/constants');
const bma       = require('../../app/modules/bma').BmaDependency.duniter.methods.bma;
const toolbox   = require('./tools/toolbox');
const node   = require('./tools/node');
const unit   = require('./tools/unit');
const http   = require('./tools/http');

const now = 1480000000;

const conf = {
  dt: 1000,
  ud0: 200,
  udTime0: now - 1, // So we have a UD right on block#1
  medianTimeBlocks: 1 // Easy: medianTime(b) = time(b-1)
};

let s1, cat, tac

describe("Transactions: CLTV", function() {

  before(() => co(function*() {
    const res = yield toolbox.simpleNodeWith2Users(conf);
    s1 = res.s1;
    cat = res.cat;
    tac = res.tac;
    yield s1.commit({ time: now });
    yield s1.commit({ time: now + 1 });
  }));

  after(() => {
    return Promise.all([
      s1.closeCluster()
    ])
  })

  it('it should exist block#1 with UD of 200', () => s1.expect('/blockchain/block/1', (block) => {
    should.exists(block);
    assert.equal(block.number, 1);
    assert.equal(block.dividend, 200);
  }));

  it('with SIG and CLTV', () => co(function *() {
    let tx1 = yield cat.prepareITX(200, tac);
    yield unit.shouldNotFail(cat.sendTX(tx1));
    yield s1.commit({ time: now + 19 }); // TODO: why not in the same block?
    let current = yield s1.get('/blockchain/current');
    let tx2 = yield tac.prepareUTX(tx1, ['SIG(0)'], [{ qty: 200, base: 0, lock: 'SIG(' + cat.pub + ') && CLTV(1480000022)' }], {
      comment: 'must wait until time 1480000022',
      blockstamp: [current.number, current.hash].join('-')
    });
    yield unit.shouldNotFail(cat.sendTX(tx2));
    yield s1.commit({ time: now + 21 }); // TODO: why not in the same block?
    let tx3 = yield cat.prepareITX(200, tac);
    yield unit.shouldFail(cat.sendTX(tx3), 'Wrong unlocker in transaction');
    yield s1.commit({ time: now + 22 });
    yield unit.shouldNotFail(cat.sendTX(tx3)); // Because next block will have medianTime = 22
    yield s1.commit({ time: now + 22 });
  }));
});
