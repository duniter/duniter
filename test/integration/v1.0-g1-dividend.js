"use strict";

const co        = require('co');
const should    = require('should');
const bma       = require('../../app/modules/bma').BmaDependency.duniter.methods.bma;
const constants = require('../../app/lib/constants');
const toolbox   = require('./tools/toolbox');

const start = 1488985390; // 2016-03-08 16:03:10 UTC+0
const delayToUD = 1489057200 - start; // Delay to 2016-03-09 12:00:00 UTC+0

const aDay = 3600 * 24;
const _6months = 15778800;

const conf = {
  ud0: 1000,
  udTime0: 1488970800, // 2016-03-08 12:00:00 UTC+0
  udReevalTime0: 1490094000, // 2016-03-21 12:00:00 UTC+0 ==> first recomputed UD (equinox)
  c: .0488, // 4.88 %
  dt: aDay,
  dtReeval: _6months, // 6 months
  medianTimeBlocks: 1, // The medianTime always equals previous block's medianTime for easy testing
  avgGenTime: 3600 * 24 // 1 bloc a day
};

let s1, cat, tac;

describe("Protocol 1.0 Ğ1 Dividend", function() {

  /*****
   * DESCRIPTION
   * -----------
   *
   * Simulates the real dividends that would occur in the currency (simulating N)
   */

  before(() => co(function*() {

    const res1 = yield toolbox.simpleNodeWith2Users(conf);
    s1 = res1.s1;
    cat = res1.cat; // HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd
    tac = res1.tac; // 2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc
    yield s1.commit({ time: start });
    yield s1.commit({ time: start + 1 });
    yield s1.commit({ time: start + delayToUD });
    for (let i = 1; i < 15; i++) {
      yield s1.commit({ time: (start + delayToUD) + aDay * i });
    }
  }));

  it('should have block#0 has no UD', () => s1.expectThat('/blockchain/block/0', (json) => {
    should.not.exist(json.dividend);
    json.should.have.property('medianTime').equal(start); // 2016-03-08 16:03:10 UTC+0
  }));

  it('should have block#1 has no UD', () => s1.expectThat('/blockchain/block/1', (json) => {
    json.dividend.should.equal(1000);
    json.should.have.property('medianTime').equal(start); // 2016-03-08 16:03:10 UTC+0
  }));

  it('should have block#2 with UD 1000', () => s1.expectThat('/blockchain/block/2', (json) => {
    should.not.exist(json.dividend);
    json.should.have.property('medianTime').equal(start + 1); // 2016-03-08 16:03:11 UTC+0
  }));

  it('should have block#3 with UD 1000', () => s1.expectThat('/blockchain/block/3', (json) => {
    json.dividend.should.equal(1000);
    json.should.have.property('medianTime').equal(start + delayToUD); // 2016-03-09 12:00:00 UTC+0
  }));

  it('should have block#4 with UD 1000', () => s1.expectThat('/blockchain/block/4', (json) => {
    json.dividend.should.equal(1000);
    json.should.have.property('medianTime').equal((start + delayToUD) + aDay); // 2016-03-10 12:00:00 UTC+0
  }));

  it('should have block#4 with UD 1000', () => s1.expectThat('/blockchain/block/5', (json) => {
    json.dividend.should.equal(1000);
    json.should.have.property('medianTime').equal((start + delayToUD) + aDay * 2); // 2016-03-11 12:00:00 UTC+0
  }));

  it('should have block#4 with UD 1000', () => s1.expectThat('/blockchain/block/6', (json) => {
    json.dividend.should.equal(1000);
    json.should.have.property('medianTime').equal((start + delayToUD) + aDay * 3); // 2016-03-12 12:00:00 UTC+0
  }));

  // ... skip some blocks ...

  it('should have block#11 with UD 1000', () => s1.expectThat('/blockchain/block/11', (json) => {
    json.dividend.should.equal(1000);
    json.should.have.property('medianTime').equal((start + delayToUD) + aDay * 8); // 2016-03-17 12:00:00 UTC+0
  }));

  it('should have block#12 with UD 1000', () => s1.expectThat('/blockchain/block/12', (json) => {
    json.dividend.should.equal(1000);
    json.should.have.property('medianTime').equal((start + delayToUD) + aDay * 9); // 2016-03-18 12:00:00 UTC+0
  }));

  it('should have block#13 with UD 1000', () => s1.expectThat('/blockchain/block/13', (json) => {
    json.dividend.should.equal(1000);
    json.should.have.property('medianTime').equal((start + delayToUD) + aDay * 10); // 2016-03-19 12:00:00 UTC+0
  }));

  it('should have block#14 with UD 1000', () => s1.expectThat('/blockchain/block/14', (json) => {
    json.dividend.should.equal(1000);
    json.should.have.property('medianTime').equal((start + delayToUD) + aDay * 11); // 2016-03-20 12:00:00 UTC+0
  }));

  it('should have block#14 with UD 1000, even if dtReeval has been reached', () => s1.expectThat('/blockchain/block/15', (json) => {
    json.dividend.should.equal(1000);
    json.should.have.property('medianTime').equal((start + delayToUD) + aDay * 12); // 2016-03-21 12:00:00 UTC+0
  }));

  it('should have block#14 with UD 1000, even if dtReeval has been reached', () => s1.expectThat('/blockchain/block/16', (json) => {
    json.dividend.should.equal(1000);
    json.should.have.property('medianTime').equal((start + delayToUD) + aDay * 13); // 2016-03-22 12:00:00 UTC+0
  }));
});
