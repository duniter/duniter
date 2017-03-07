"use strict";

const co        = require('co');
const should    = require('should');
const bma       = require('duniter-bma').duniter.methods.bma;
const constants = require('../../app/lib/constants');
const toolbox   = require('./tools/toolbox');

const now = 1480000000;

const conf = {
  ud0: 9995,
  c: .99,
  dt: 300,
  udTime0: now + 300,
  udReevalTime0: now + 300,
  avgGenTime: 5000,
  medianTimeBlocks: 1 // The medianTime always equals previous block's medianTime
};

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
        { type: 'T', noffset: 1, identifier: '50844926EC611BF6BBF9918A657F87E0AA0DE5A5D8DB3D476289BF64C6ED8C25', amount: 6995, base: 0 }
      ]);
    });
    yield s1.expectThat('/tx/sources/2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', (json) => {
      json.sources.should.deepEqual([
        { type: 'D', noffset: 2, identifier: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', amount: 9995, base: 0 },
        { type: 'T', noffset: 0, identifier: 'E84C72FBE788F6F52B293676A8314A6F227F14B0A8FD0168E1C4F08E85D1F8E9', amount: 2999, base: 0 },
        { type: 'T', noffset: 0, identifier: '50844926EC611BF6BBF9918A657F87E0AA0DE5A5D8DB3D476289BF64C6ED8C25', amount: 1, base: 0 }
      ]);
    });
  }));

  it('should be able to send money to tac with still no losses', () => co(function*() {
    yield cat.sendP(5495, tac);
    yield s1.commit({ time: now + 300 });
    yield s1.expectThat('/tx/sources/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', (json) => {
      json.sources.should.deepEqual([
        { type: 'T', noffset: 1, identifier: 'DA453C8B6300F06AC538D7EFB154DA9AE51F30D525236B9D4AD13944E18AA1B0', amount: 1500, base: 0 }
      ]);
    });
    yield s1.expectThat('/tx/sources/2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', (json) => {
      json.sources.should.deepEqual([
        { type: 'D', noffset: 2, identifier: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', amount: 9995, base: 0 },
        { type: 'T', noffset: 0, identifier: 'E84C72FBE788F6F52B293676A8314A6F227F14B0A8FD0168E1C4F08E85D1F8E9', amount: 2999, base: 0 },
        { type: 'T', noffset: 0, identifier: '50844926EC611BF6BBF9918A657F87E0AA0DE5A5D8DB3D476289BF64C6ED8C25', amount: 1, base: 0 },
        { type: 'T', noffset: 0, identifier: 'DA453C8B6300F06AC538D7EFB154DA9AE51F30D525236B9D4AD13944E18AA1B0', amount: 5495, base: 0 }
      ]);
    });
  }));

  it('should be able to lose money by sending 1,99,100,999,1000,300+700 units to random accounts', () => co(function*() {
    yield s1.expectThat('/tx/sources/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', (json) => {
      json.sources.should.deepEqual([
        { type: 'T', noffset: 1, identifier: 'DA453C8B6300F06AC538D7EFB154DA9AE51F30D525236B9D4AD13944E18AA1B0', amount: 1500, base: 0 }
      ]);
    });
    yield cat.sendP(1, '6EQoFVnFf2xpaRzieNTXmAKU6XkDHYrvgorJ8ppMFa8b');
    yield s1.commit({ time: now + 300 });
    yield s1.expectThat('/tx/sources/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', (json) => {
      json.sources.should.deepEqual([
        { type: 'T', noffset: 1, identifier: 'A6F2C3DFF8EFEBE226F103E86193A8F22A51D25DD63C2BB9BF86D9A5F3DC55B8', amount: 1499, base: 0 }
      ]);
    });
    yield cat.sendP(99, '2EvWF9XM6TY3zUDjwi3qfGRW5zhN11TXcUDXdgK2XK41');
    yield s1.commit({ time: now + 300 });
    yield s1.expectThat('/tx/sources/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', (json) => {
      json.sources.should.deepEqual([
        { type: 'T', noffset: 1, identifier: 'F1C86F38F33B2D37561EE927801D8B630BCADA62336E4BBC718BA06B1101584C', amount: 1400, base: 0 }
      ]);
    });
    yield cat.sendP(100, 'DPFgnVSB14QnYFjKNhbFRYLxroSmaXZ53TzgFZBcCxbF');
    yield s1.commit({ time: now + 300 });
    yield s1.expectThat('/tx/sources/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', (json) => {
      json.sources.should.deepEqual([
        { type: 'T', noffset: 1, identifier: '0FAD3D25899C789C1C2B12FE3D90BF26E5794FB31ECF5072A881DF9B83E7CA00', amount: 1300, base: 0 }
      ]);
    });
    yield tac.sendP(4, 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
    yield cat.sendP(999, '4WmQWq4NuJtu6mzFDKkmmu6Cm6BZvgoY4b4MMDMwVvu7');
    yield s1.commit({ time: now + 300 });
    yield s1.expectThat('/tx/sources/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', (json) => {
      json.sources.should.deepEqual([
        { type: 'T', noffset: 0, identifier: '3B12EEC97704A8CCA31AFD7B60BA09555744703E22A6A47EE4ECBE6DA20B27E5', amount: 4, base: 0 },
        { type: 'T', noffset: 1, identifier: '9B18E2C2CBF9C856560E76F8684665C8677DD0506AAD5195960E30CC37A5706C', amount: 301, base: 0 }
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
        { type: 'T', noffset: 0, identifier: '0FAD3D25899C789C1C2B12FE3D90BF26E5794FB31ECF5072A881DF9B83E7CA00', amount: 100, base: 0 }
      ]);
    });
    // Has way enough on the account (999 units)
    yield s1.expectThat('/tx/sources/4WmQWq4NuJtu6mzFDKkmmu6Cm6BZvgoY4b4MMDMwVvu7', (json) => {
      json.sources.should.deepEqual([
        { type: 'T', noffset: 0, identifier: '9B18E2C2CBF9C856560E76F8684665C8677DD0506AAD5195960E30CC37A5706C', amount: 999, base: 0 }
      ]);
    });
    // Has way enough on the account (300 + 700 units)
    yield s1.expectThat('/tx/sources/7kMAi8wttYKPK5QSfCwoDriNTcCTWKzTbuSjsLsjGJX2', (json) => {
      json.sources.should.deepEqual([
        { type: 'T', noffset: 0, identifier: '37CD105D17182155978798C773C70950470EBFB27B082F888B3423670F956F35', amount: 300, base: 0 },
        { type: 'T', noffset: 0, identifier: '6EF384807D1100D51BCCB9ED6E6FF4CA12CC1F4F30392CFD43746D4D1C4BC22E', amount: 700, base: 0 }
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
        { type: 'T', noffset: 0, identifier: '37CD105D17182155978798C773C70950470EBFB27B082F888B3423670F956F35', amount: 300, base: 0 },
        { type: 'T', noffset: 0, identifier: '6EF384807D1100D51BCCB9ED6E6FF4CA12CC1F4F30392CFD43746D4D1C4BC22E', amount: 700, base: 0 }
      ]);
    });
    yield s1.commit({ time: now + 1800 });
    // Has enough on the account (300x10^0 + 700x10^0 = 1000x10^0 = 100x10^1)
    yield s1.expectThat('/tx/sources/7kMAi8wttYKPK5QSfCwoDriNTcCTWKzTbuSjsLsjGJX2', (json) => {
      json.sources.should.deepEqual([
        { type: 'T', noffset: 0, identifier: '37CD105D17182155978798C773C70950470EBFB27B082F888B3423670F956F35', amount: 300, base: 0 },
        { type: 'T', noffset: 0, identifier: '6EF384807D1100D51BCCB9ED6E6FF4CA12CC1F4F30392CFD43746D4D1C4BC22E', amount: 700, base: 0 }
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
