"use strict";

const co        = require('co');
const should    = require('should');
const bma       = require('../../app/lib/streams/bma');
const constants = require('../../app/lib/constants');
const limiter   = require('../../app/lib/system/limiter');
const toolbox   = require('./tools/toolbox');
const multicaster = require('../../app/lib/streams/multicaster');

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

    limiter.noLimit();
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
    yield cat.sendP(3000, tac);
    yield s1.commit({ time: now + 300 });
    yield s1.expectThat('/tx/sources/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', (json) => {
      json.sources.should.deepEqual([
        { type: 'T', noffset: 1, identifier: '693C54130D1D393767347F657D074FA471E0844FC1CF35A6FDEAC68849737A01', amount: 6995, base: 0 }
      ]);
    });
    yield s1.expectThat('/tx/sources/2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', (json) => {
      json.sources.should.deepEqual([
        { type: 'D', noffset: 2, identifier: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', amount: 9995, base: 0 },
        { type: 'T', noffset: 0, identifier: '693C54130D1D393767347F657D074FA471E0844FC1CF35A6FDEAC68849737A01', amount: 3000, base: 0 }
      ]);
    });
  }));

  it('should be able to send money to tac with still no losses', () => co(function*() {
    yield cat.sendP(5495, tac);
    yield s1.commit({ time: now + 300 });
    yield s1.expectThat('/tx/sources/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', (json) => {
      json.sources.should.deepEqual([
        { type: 'T', noffset: 1, identifier: '1E47AF2308490CD7480CD509F3D031B9F1E0DEE9E40FEC9CF9462CEE412C0710', amount: 1500, base: 0 }
      ]);
    });
    yield s1.expectThat('/tx/sources/2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', (json) => {
      json.sources.should.deepEqual([
        { type: 'D', noffset: 2, identifier: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', amount: 9995, base: 0 },
        { type: 'T', noffset: 0, identifier: '693C54130D1D393767347F657D074FA471E0844FC1CF35A6FDEAC68849737A01', amount: 3000, base: 0 },
        { type: 'T', noffset: 0, identifier: '1E47AF2308490CD7480CD509F3D031B9F1E0DEE9E40FEC9CF9462CEE412C0710', amount: 5495, base: 0 }
      ]);
    });
  }));

  it('should be able to lose money by sending 1,99,100,999,1000,300+700 units to random accounts', () => co(function*() {
    yield cat.sendP(1, '6EQoFVnFf2xpaRzieNTXmAKU6XkDHYrvgorJ8ppMFa8b');
    yield s1.commit({ time: now + 300 });
    yield cat.sendP(99, '2EvWF9XM6TY3zUDjwi3qfGRW5zhN11TXcUDXdgK2XK41');
    yield s1.commit({ time: now + 300 });
    yield cat.sendP(100, 'DPFgnVSB14QnYFjKNhbFRYLxroSmaXZ53TzgFZBcCxbF');
    yield s1.commit({ time: now + 300 });
    yield cat.sendP(999, '4WmQWq4NuJtu6mzFDKkmmu6Cm6BZvgoY4b4MMDMwVvu7');
    yield s1.commit({ time: now + 300 });
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
        { type: 'T', noffset: 0, identifier: '5218AA814F5AE71BF9ECF2DC86D8E8D85968F98E220D2E12DB6AAEFD2CD9EEE0', amount: 100, base: 0 }
      ]);
    });
    // Has way enough on the account (999 units)
    yield s1.expectThat('/tx/sources/4WmQWq4NuJtu6mzFDKkmmu6Cm6BZvgoY4b4MMDMwVvu7', (json) => {
      json.sources.should.deepEqual([
        { type: 'T', noffset: 0, identifier: 'F603AD88714A83A0B3C68BA14E311C55CD81F609C033B18501BAE1C8A21CB174', amount: 999, base: 0 }
      ]);
    });
    // Has way enough on the account (300 + 700 units)
    yield s1.expectThat('/tx/sources/7kMAi8wttYKPK5QSfCwoDriNTcCTWKzTbuSjsLsjGJX2', (json) => {
      json.sources.should.deepEqual([
        { type: 'T', noffset: 0, identifier: 'C6FBF49423B6B629DEDB3CA1F0CD2BDE756C3FD5CFA009A52218A8098E18B9D4', amount: 300, base: 0 },
        { type: 'T', noffset: 0, identifier: 'CE69CC143D8725ECB6D666B8194907DFCA8F2FD3242271F9DA16CA6B37290BA1', amount: 700, base: 0 }
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
        { type: 'T', noffset: 0, identifier: 'C6FBF49423B6B629DEDB3CA1F0CD2BDE756C3FD5CFA009A52218A8098E18B9D4', amount: 300, base: 0 },
        { type: 'T', noffset: 0, identifier: 'CE69CC143D8725ECB6D666B8194907DFCA8F2FD3242271F9DA16CA6B37290BA1', amount: 700, base: 0 }
      ]);
    });
    yield s1.commit({ time: now + 1800 });
    // Has enough on the account (300x10^0 + 700x10^0 = 1000x10^0 = 100x10^1)
    yield s1.expectThat('/tx/sources/7kMAi8wttYKPK5QSfCwoDriNTcCTWKzTbuSjsLsjGJX2', (json) => {
      json.sources.should.deepEqual([
        { type: 'T', noffset: 0, identifier: 'C6FBF49423B6B629DEDB3CA1F0CD2BDE756C3FD5CFA009A52218A8098E18B9D4', amount: 300, base: 0 },
        { type: 'T', noffset: 0, identifier: 'CE69CC143D8725ECB6D666B8194907DFCA8F2FD3242271F9DA16CA6B37290BA1', amount: 700, base: 0 }
      ]);
    });
    yield s1.commit({ time: now + 3600 });
    yield s1.expectThat('/tx/sources/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', (json) => {
      json.sources.should.deepEqual([
        { type: 'D', noffset: 10, identifier: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', amount: 1980, base: 1 },
        { type: 'D', noffset: 11, identifier: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', amount: 4901, base: 1 },
        { type: 'D', noffset: 12, identifier: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', amount: 1263, base: 2 }
      ]);
    });
  }));
});
