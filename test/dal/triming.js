"use strict";
const co = require('co');
const should = require('should');
const FileDAL = require('../../app/lib/dal/fileDAL');
const dir = require('../../app/lib/system/directory');
const indexer = require('../../app/lib/dup/indexer');
const toolbox = require('../integration/tools/toolbox');

let dal;

describe("Triming", function(){

  before(() => co(function *() {
    dal = FileDAL(yield dir.getHomeParams(true, 'db0'));
    yield dal.init();
  }));

  it('should be able to feed the bindex', () => co(function *() {
    yield dal.bindexDAL.insertBatch([
      { number: 121, version: 6, bsize: 0, hash: "HASH", issuer: "ISSUER", time: 0, membersCount: 3, issuersCount: 2, issuersFrame: 1, issuersFrameVar: 2, avgBlockSize: 0, medianTime: 1482500000, dividend: 100, mass: 300, unitBase: 2, powMin: 70, udTime: 0, diffNumber: 5, speed: 1.0 },
      { number: 122, version: 6, bsize: 0, hash: "HASH", issuer: "ISSUER", time: 0, membersCount: 3, issuersCount: 2, issuersFrame: 1, issuersFrameVar: 2, avgBlockSize: 0, medianTime: 1482500000, dividend: 100, mass: 300, unitBase: 2, powMin: 70, udTime: 0, diffNumber: 5, speed: 1.0 },
      { number: 123, version: 6, bsize: 0, hash: "HASH", issuer: "ISSUER", time: 0, membersCount: 3, issuersCount: 2, issuersFrame: 1, issuersFrameVar: 2, avgBlockSize: 0, medianTime: 1482500000, dividend: 100, mass: 300, unitBase: 2, powMin: 70, udTime: 0, diffNumber: 5, speed: 1.0 },
      { number: 124, version: 6, bsize: 0, hash: "HASH", issuer: "ISSUER", time: 0, membersCount: 3, issuersCount: 2, issuersFrame: 1, issuersFrameVar: 2, avgBlockSize: 0, medianTime: 1482500000, dividend: 100, mass: 300, unitBase: 2, powMin: 70, udTime: 0, diffNumber: 5, speed: 1.0 },
      { number: 125, version: 6, bsize: 0, hash: "HASH", issuer: "ISSUER", time: 0, membersCount: 3, issuersCount: 2, issuersFrame: 1, issuersFrameVar: 2, avgBlockSize: 0, medianTime: 1482500000, dividend: 100, mass: 300, unitBase: 2, powMin: 70, udTime: 0, diffNumber: 5, speed: 1.0 }
    ]);
  }));

  it('should have bindex head(1) = 125', () => co(function *() {
    const head = yield dal.bindexDAL.head(1);
    head.should.have.property('number').equal(125);
  }));

  it('should have bindex range(1, 3) = 125, 124, 123', () => co(function *() {
    const range = yield dal.bindexDAL.range(1,3);
    range.should.have.length(3);
    range[0].should.have.property('number').equal(125);
    range[1].should.have.property('number').equal(124);
    range[2].should.have.property('number').equal(123);
  }));

  it('should be able to feed the iindex', () => co(function *() {
    yield dal.iindexDAL.insertBatch([
      { op: 'CREATE', pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', uid: 'cat', created_on: '121-H', written_on: '122-H', member: true,  wasMember: true, kick: false },
      { op: 'UPDATE', pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', uid: null,  created_on: '121-H', written_on: '123-H', member: null,  wasMember: null, kick: true },
      { op: 'UPDATE', pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', uid: null,  created_on: '121-H', written_on: '124-H', member: false, wasMember: null, kick: false }
    ]);
    let lignes = yield dal.iindexDAL.reducable('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
    lignes.should.have.length(3);
    indexer.DUP_HELPERS.reduce(lignes).should.have.property('member').equal(false);
  }));

  it('should be able to trim the iindex', () => co(function *() {
    // Triming
    yield dal.trimIndexes(124);
    const lignes = yield dal.iindexDAL.reducable('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
    lignes.should.have.length(2);
    indexer.DUP_HELPERS.reduce(lignes).should.have.property('member').equal(false);
  }));

  it('triming again the iindex should have no effet', () => co(function *() {
    // Triming
    yield dal.trimIndexes(124);
    const lignes = yield dal.iindexDAL.reducable('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
    lignes.should.have.length(2);
    indexer.DUP_HELPERS.reduce(lignes).should.have.property('member').equal(false);
  }));

  it('should be able to feed the mindex', () => co(function *() {
    yield dal.mindexDAL.insertBatch([
      { op: 'CREATE', pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', created_on: '121-H', written_on: '122-H', expires_on: 1000, expired_on: null },
      { op: 'UPDATE', pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', created_on: '121-H', written_on: '123-H', expires_on: 1200, expired_on: null },
      { op: 'UPDATE', pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', created_on: '121-H', written_on: '124-H', expires_on: null, expired_on: null },
      { op: 'UPDATE', pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', created_on: '121-H', written_on: '125-H', expires_on: 1400, expired_on: null }
    ]);
    const lignes = yield dal.mindexDAL.reducable('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
    lignes.should.have.length(4);
    indexer.DUP_HELPERS.reduce(lignes).should.have.property('expires_on').equal(1400);
  }));

  it('should be able to trim the mindex', () => co(function *() {
    // Triming
    yield dal.trimIndexes(124);
    const lignes = yield dal.mindexDAL.reducable('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
    lignes.should.have.length(3);
    indexer.DUP_HELPERS.reduce(lignes).should.have.property('expires_on').equal(1400);
  }));

  it('should be able to feed the cindex', () => co(function *() {
    yield dal.cindexDAL.insertBatch([
      { op: 'CREATE', issuer: 'HgTT', receiver: 'DNan', created_on: '121-H', written_on: '126-H', expires_on: 1000, expired_on: null },
      { op: 'UPDATE', issuer: 'HgTT', receiver: 'DNan', created_on: '121-H', written_on: '126-H', expires_on: null, expired_on: 3000 },
      { op: 'CREATE', issuer: 'DNan', receiver: 'HgTT', created_on: '125-H', written_on: '126-H', expires_on: null, expired_on: null }
    ]);
    (yield dal.cindexDAL.sqlFind({ issuer: 'HgTT' })).should.have.length(2);
    (yield dal.cindexDAL.sqlFind({ issuer: 'DNan' })).should.have.length(1);
  }));

  it('should be able to trim the cindex', () => co(function *() {
    // Triming
    yield dal.trimIndexes(127);
    (yield dal.cindexDAL.sqlFind({ issuer: 'HgTT' })).should.have.length(0);
    // { op: 'UPDATE', issuer: 'DNan', receiver: 'HgTT', created_on: '125-H', written_on: '126-H', expires_on: 3600, expired_on: null },/**/
    (yield dal.cindexDAL.sqlFind({ issuer: 'DNan' })).should.have.length(1);
  }));

  it('should be able to feed the sindex', () => co(function *() {
    yield dal.sindexDAL.insertBatch([
      { op: 'CREATE', identifier: 'SOURCE_1', pos: 4, written_on: '126-H', written_time: 2000, consumed: false },
      { op: 'UPDATE', identifier: 'SOURCE_1', pos: 4, written_on: '139-H', written_time: 4500, consumed: true },
      { op: 'CREATE', identifier: 'SOURCE_2', pos: 4, written_on: '126-H', written_time: 2000, consumed: false },
      { op: 'CREATE', identifier: 'SOURCE_3', pos: 4, written_on: '126-H', written_time: 2000, consumed: false }
    ]);
    (yield dal.sindexDAL.sqlFind({ identifier: 'SOURCE_1' })).should.have.length(2);
    (yield dal.sindexDAL.sqlFind({ pos: 4 })).should.have.length(4);
  }));

  it('should be able to trim the sindex', () => co(function *() {
    // Triming
    yield dal.trimIndexes(140);
    (yield dal.sindexDAL.sqlFind({ identifier: 'SOURCE_1' })).should.have.length(0);
    (yield dal.sindexDAL.sqlFind({ pos: 4 })).should.have.length(2);
  }));

  it('should be able to trim the bindex', () => co(function *() {
    // Triming
    const server = (yield toolbox.simpleNodeWith2Users({
      pair: {
        pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
        sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
      },
      sigQty: 1,
      dtDiffEval: 2,
      medianTimeBlocks: 3
    })).s1;
    // const s1 = server.s1;
    for (let i = 0; i < 13; i++) {
      yield server.commit();
    }
    (yield server.dal.bindexDAL.head(1)).should.have.property('number').equal(12);
    (yield server.dal.bindexDAL.head(13)).should.have.property('number').equal(0);
    yield server.commit();
    should.not.exists(yield server.dal.bindexDAL.head(14)); // Trimed
  }));
});
