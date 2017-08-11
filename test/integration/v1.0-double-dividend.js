"use strict";

const co        = require('co');
const should    = require('should');
const bma       = require('../../app/modules/bma').BmaDependency.duniter.methods.bma;
const constants = require('../../app/lib/constants');
const toolbox   = require('./tools/toolbox');

const now = 1480000000;

const conf = {
  ud0: 1000,
  udTime0: now + 4, // Delay first UD recomputation to +20
  udReevalTime0: now + 12, // Delay first UD recomputation to +20
  c: .0488,
  dt: 2,
  dtReeval: 10, // => create 5 dividends of 200
  medianTimeBlocks: 1 // The medianTime always equals previous block's medianTime
};

let s1, cat, tac;

describe("Protocol 1.0 Dividend Update", function() {

  /*****
   * DESCRIPTION
   * -----------
   *
   * The dividend is computed over 2 main variables:
   *
   *   * main step dividend: this is a theoretical dividend
   *   * effective dividend: this is the real dividend, which is a share of the theoretical one
   */

  before(() => co(function*() {

    const res1 = yield toolbox.simpleNodeWith2Users(conf);
    s1 = res1.s1;
    cat = res1.cat; // HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd
    tac = res1.tac; // 2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc
    yield s1.commit({ time: now });
    yield s1.commit({ time: now + 3 });
    yield s1.commit({ time: now + 4 });
    yield s1.commit({ time: now + 5 });
    yield s1.commit({ time: now + 6 });
    yield s1.commit({ time: now + 8 });
    yield s1.commit({ time: now + 10 });
    yield s1.commit({ time: now + 12 });
    yield s1.commit({ time: now + 14 });
    yield s1.commit({ time: now + 16 });
  }));

  after(() => {
    return Promise.all([
      s1.closeCluster()
    ])
  })

  it('should have block#2 with no UD', () => s1.expectThat('/blockchain/block/2', (json) => {
    should.not.exist(json.dividend);
  }));

  it('should have block#3 with UD 1000', () => s1.expectThat('/blockchain/block/3', (json) => {
    json.dividend.should.equal(1000);
  }));

  it('should have block#4 with no UD', () => s1.expectThat('/blockchain/block/4', (json) => {
    should.not.exist(json.dividend);
  }));

  it('should have block#5 with UD 1000', () => s1.expectThat('/blockchain/block/5', (json) => {
    json.dividend.should.equal(1000);
  }));

  it('should have block#6 with UD 1000', () => s1.expectThat('/blockchain/block/6', (json) => {
    json.dividend.should.equal(1000);
  }));

  it('should have block#7 with UD 1000', () => s1.expectThat('/blockchain/block/7', (json) => {
    json.dividend.should.equal(1000);
  }));

  it('should have block#8 with UD 1000', () => s1.expectThat('/blockchain/block/8', (json) => {
    json.dividend.should.equal(1000);
  }));

  it('should have block#9 with UD 1000', () => s1.expectThat('/blockchain/block/9', (json) => {
    json.dividend.should.equal(1000);
  }));
});
