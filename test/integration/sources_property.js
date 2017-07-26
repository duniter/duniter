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

describe("Sources property", function() {

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

  it('it should exist sources for HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', () => s1.expect('/tx/sources/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', (res) => {
    assert.equal(res.sources.length, 1)
  }));

  it('it should NOT exist sources if we change one letter to uppercased version', () => s1.expect('/tx/sources/HGTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', (res) => {
    assert.equal(res.sources.length, 0)
  }));
});
