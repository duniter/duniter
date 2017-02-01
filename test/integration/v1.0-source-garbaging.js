"use strict";

const co        = require('co');
const should    = require('should');
const bma       = require('duniter-bma').duniter.methods.bma;
const constants = require('../../app/lib/constants');
const toolbox   = require('./tools/toolbox');

const conf = {
  ud0: 9995,
  c: .99,
  dt: 300,
  avgGenTime: 5000,
  medianTimeBlocks: 1 // The medianTime always equals previous block's medianTime
};

const now = 1480000000;

constants.CORES_MAXIMUM_USE_IN_PARALLEL = 1;
constants.NB_DIGITS_UD = 4;

let s1, cat, tac;

describe("Protocol 1.0 Source Garbaging", function() {

  /*****
   * DESCRIPTION
   * -----------
   *
   * All accounts having less than 100 units of money (current base) must see their money garbaged, i.e. destroyed.
   *
   * This measure is here to avoid a metastasizing of the database because of users who would spend very little amounts
   * of money to random addresses, or to finally destroy very old money (dozens of years).
   */

  before(() => co(function*() {

    const res1 = yield toolbox.simpleNodeWith2Users(conf);
    s1 = res1.s1;
    cat = res1.cat; // HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd
    tac = res1.tac; // 2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc
    yield s1.commit({ time: now });
    yield s1.commit({ time: now + 300 });
  }));

  it('cat should have no source initially', () => co(function*() {
    yield s1.expectThat('/tx/sources/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', (json) => {
      json.sources.should.have.length(0);
    });
  }));

  it('cat should have a Dividend, as well as tac', () => co(function*() {
    yield s1.commit({ time: now + 300 });
    yield s1.expectThat('/tx/sources/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', (json) => {
      json.sources.should.deepEqual([
        { type: 'D', noffset: 2, identifier: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', amount: 9995, base: 0 }
      ]);
    });
  }));

  it('should be able to send money to tac with no losses', () => co(function*() {
    yield cat.sendP(2999, tac);
    yield s1.commit({ time: now + 300 });
    yield cat.sendP(1, tac);
    yield s1.commit({ time: now + 300 });
    yield s1.expectThat('/tx/sources/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', (json) => {
      json.sources.should.deepEqual([
        { type: 'T', noffset: 1, identifier: '0DD9901D4AC08B8F77584F2AA86235873D095C071361A4419949C1F41634AD71', amount: 6995, base: 0 }
      ]);
    });
    yield s1.expectThat('/tx/sources/2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', (json) => {
      json.sources.should.deepEqual([
        { type: 'D', noffset: 2, identifier: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', amount: 9995, base: 0 },
        { type: 'T', noffset: 0, identifier: '05339B305C93BCFD000DD0578EED8D8C1B1884525E669A90C471DDE431628BCA', amount: 2999, base: 0 },
        { type: 'T', noffset: 0, identifier: '0DD9901D4AC08B8F77584F2AA86235873D095C071361A4419949C1F41634AD71', amount: 1, base: 0 }
      ]);
    });
  }));

  it('should be able to send money to tac with still no losses', () => co(function*() {
    yield cat.sendP(5495, tac);
    yield s1.commit({ time: now + 300 });
    yield s1.expectThat('/tx/sources/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', (json) => {
      json.sources.should.deepEqual([
        { type: 'T', noffset: 1, identifier: '03E54C10B62FC39558D1743CA130AFF9A172CD8485FDA6BAD7FA50421A456F4C', amount: 1500, base: 0 }
      ]);
    });
    yield s1.expectThat('/tx/sources/2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', (json) => {
      json.sources.should.deepEqual([
        { type: 'D', noffset: 2, identifier: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', amount: 9995, base: 0 },
        { type: 'T', noffset: 0, identifier: '05339B305C93BCFD000DD0578EED8D8C1B1884525E669A90C471DDE431628BCA', amount: 2999, base: 0 },
        { type: 'T', noffset: 0, identifier: '0DD9901D4AC08B8F77584F2AA86235873D095C071361A4419949C1F41634AD71', amount: 1, base: 0 },
        { type: 'T', noffset: 0, identifier: '03E54C10B62FC39558D1743CA130AFF9A172CD8485FDA6BAD7FA50421A456F4C', amount: 5495, base: 0 }
      ]);
    });
  }));

  it('should be able to lose money by sending 1,99,100,999,1000,300+700 units to random accounts', () => co(function*() {
    yield s1.expectThat('/tx/sources/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', (json) => {
      json.sources.should.deepEqual([
        { type: 'T', noffset: 1, identifier: '03E54C10B62FC39558D1743CA130AFF9A172CD8485FDA6BAD7FA50421A456F4C', amount: 1500, base: 0 }
      ]);
    });
    yield cat.sendP(1, '6EQoFVnFf2xpaRzieNTXmAKU6XkDHYrvgorJ8ppMFa8b');
    yield s1.commit({ time: now + 300 });
    yield s1.expectThat('/tx/sources/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', (json) => {
      json.sources.should.deepEqual([
        { type: 'T', noffset: 1, identifier: 'F260D0403BCF49812C5002324E096A19B725D922F654DB31F0F144C830E10380', amount: 1499, base: 0 }
      ]);
    });
    yield cat.sendP(99, '2EvWF9XM6TY3zUDjwi3qfGRW5zhN11TXcUDXdgK2XK41');
    yield s1.commit({ time: now + 300 });
    yield s1.expectThat('/tx/sources/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', (json) => {
      json.sources.should.deepEqual([
        { type: 'T', noffset: 1, identifier: '217ACD8A6D98DBB38D8C8C6C8A930049933A09B2D7283501BD61857506351875', amount: 1400, base: 0 }
      ]);
    });
    yield cat.sendP(100, 'DPFgnVSB14QnYFjKNhbFRYLxroSmaXZ53TzgFZBcCxbF');
    yield s1.commit({ time: now + 300 });
    yield s1.expectThat('/tx/sources/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', (json) => {
      json.sources.should.deepEqual([
        { type: 'T', noffset: 1, identifier: 'CA4817B83983AE92075B9A777C9DAED80CF07A0B2343E78ECA368D1FD342E8FC', amount: 1300, base: 0 }
      ]);
    });
    yield tac.sendP(4, 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
    yield cat.sendP(999, '4WmQWq4NuJtu6mzFDKkmmu6Cm6BZvgoY4b4MMDMwVvu7');
    yield s1.commit({ time: now + 300 });
    yield s1.expectThat('/tx/sources/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', (json) => {
      json.sources.should.deepEqual([
        { type: 'T', noffset: 1, identifier: '985B74A888072D26C2E4B31DA611C3C7BA8BF5BB3F9677F1796F0F97B2BA9620', amount: 301, base: 0 },
        { type: 'T', noffset: 0, identifier: 'CACBD70FC07A122108A8C0798EF43E9D016065210B25C8554560BDED0E4D0B88', amount: 4, base: 0 }
      ]);
    });
    yield cat.sendP(300, '7kMAi8wttYKPK5QSfCwoDriNTcCTWKzTbuSjsLsjGJX2');
    yield tac.sendP(700, '7kMAi8wttYKPK5QSfCwoDriNTcCTWKzTbuSjsLsjGJX2');
    yield s1.commit({ time: now + 900 });
    // Has spent all its money, + 1 unit destroyed
    yield s1.expectThat('/tx/sources/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', (json) => {
      json.sources.should.deepEqual([]);
    });
    // Has seen 1 unit destroyed
    yield s1.expectThat('/tx/sources/6EQoFVnFf2xpaRzieNTXmAKU6XkDHYrvgorJ8ppMFa8b', (json) => {
      json.sources.should.deepEqual([]);
    });
    // Has seen 99 unit destroyed
    yield s1.expectThat('/tx/sources/2EvWF9XM6TY3zUDjwi3qfGRW5zhN11TXcUDXdgK2XK41', (json) => {
      json.sources.should.deepEqual([]);
    });
    // Has just enough on the account (100 units)
    yield s1.expectThat('/tx/sources/DPFgnVSB14QnYFjKNhbFRYLxroSmaXZ53TzgFZBcCxbF', (json) => {
      json.sources.should.deepEqual([
        { type: 'T', noffset: 0, identifier: 'CA4817B83983AE92075B9A777C9DAED80CF07A0B2343E78ECA368D1FD342E8FC', amount: 100, base: 0 }
      ]);
    });
    // Has way enough on the account (999 units)
    yield s1.expectThat('/tx/sources/4WmQWq4NuJtu6mzFDKkmmu6Cm6BZvgoY4b4MMDMwVvu7', (json) => {
      json.sources.should.deepEqual([
        { type: 'T', noffset: 0, identifier: '985B74A888072D26C2E4B31DA611C3C7BA8BF5BB3F9677F1796F0F97B2BA9620', amount: 999, base: 0 }
      ]);
    });
    // Has way enough on the account (300 + 700 units)
    yield s1.expectThat('/tx/sources/7kMAi8wttYKPK5QSfCwoDriNTcCTWKzTbuSjsLsjGJX2', (json) => {
      json.sources.should.deepEqual([
        { type: 'T', noffset: 0, identifier: '660E2783D1D52B10DDE425D7EDE13539ABBDF7407A8656B96540ED91D46A5F01', amount: 300, base: 0 },
        { type: 'T', noffset: 0, identifier: 'FCE87BC40052FFAF8CB72EFBBD698463B3407E080807667DAC7E6239FB531238', amount: 700, base: 0 }
      ]);
    });
  }));

  it('should have lost some money with unitBase bumped from 0 to 1', () => co(function*() {
    yield s1.commit({ time: now + 900 });
    // Has no more enough on the account (100x10^0 < 100x10^1)
    yield s1.expectThat('/tx/sources/DPFgnVSB14QnYFjKNhbFRYLxroSmaXZ53TzgFZBcCxbF', (json) => {
      json.sources.should.deepEqual([]);
    });
    // Has NOT enough on the account (999x10^0 = 99.9x10^1 < 100x10^1)
    yield s1.expectThat('/tx/sources/4WmQWq4NuJtu6mzFDKkmmu6Cm6BZvgoY4b4MMDMwVvu7', (json) => {
      json.sources.should.deepEqual([]);
    });
    // Has enough on the account (300x10^0 + 700x10^0 = 1000x10^0 = 100x10^1)
    yield s1.expectThat('/tx/sources/7kMAi8wttYKPK5QSfCwoDriNTcCTWKzTbuSjsLsjGJX2', (json) => {
      json.sources.should.deepEqual([
        { type: 'T', noffset: 0, identifier: '660E2783D1D52B10DDE425D7EDE13539ABBDF7407A8656B96540ED91D46A5F01', amount: 300, base: 0 },
        { type: 'T', noffset: 0, identifier: 'FCE87BC40052FFAF8CB72EFBBD698463B3407E080807667DAC7E6239FB531238', amount: 700, base: 0 }
      ]);
    });
    yield s1.commit({ time: now + 1800 });
    // Has enough on the account (300x10^0 + 700x10^0 = 1000x10^0 = 100x10^1)
    yield s1.expectThat('/tx/sources/7kMAi8wttYKPK5QSfCwoDriNTcCTWKzTbuSjsLsjGJX2', (json) => {
      json.sources.should.deepEqual([
        { type: 'T', noffset: 0, identifier: '660E2783D1D52B10DDE425D7EDE13539ABBDF7407A8656B96540ED91D46A5F01', amount: 300, base: 0 },
        { type: 'T', noffset: 0, identifier: 'FCE87BC40052FFAF8CB72EFBBD698463B3407E080807667DAC7E6239FB531238', amount: 700, base: 0 }
      ]);
    });
    yield s1.commit({ time: now + 3600 });
    yield s1.expectThat('/tx/sources/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', (json) => {
      json.sources.should.deepEqual([
        { type: 'D', noffset: 11, identifier: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', amount: 1980, base: 1 },
        { type: 'D', noffset: 12, identifier: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', amount: 4901, base: 1 },
        { type: 'D', noffset: 13, identifier: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', amount: 1263, base: 2 }
      ]);
    });
  }));
});
