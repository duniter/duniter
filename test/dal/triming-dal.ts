// Source file from duniter: Crypto-currency software to manage libre currency such as Ğ1
// Copyright (C) 2018  Cedric Moreau <cem.moreau@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

import {FileDAL} from "../../app/lib/dal/fileDAL"
import {Directory} from "../../app/lib/system/directory"
import {Indexer} from "../../app/lib/indexer"
import {simpleNodeWith2Users} from "../integration/tools/toolbox"

const should = require('should');

let dal:FileDAL

describe("Triming", function(){

  before(async () => {
    dal = new FileDAL(await Directory.getHomeParams(true, 'db0'));
    await dal.init({} as any)
  })

  it('should be able to feed the bindex', async () => {
    await dal.bindexDAL.insertBatch([
      { number: 121, version: 6, bsize: 0, hash: "HASH", issuer: "ISSUER", time: 0, membersCount: 3, issuersCount: 2, issuersFrame: 1, issuersFrameVar: 2, avgBlockSize: 0, medianTime: 1482500000, dividend: 100, mass: 300, massReeval: 300, unitBase: 2, powMin: 70, udTime: 0, udReevalTime: 0, diffNumber: 5, speed: 1.0 },
      { number: 122, version: 6, bsize: 0, hash: "HASH", issuer: "ISSUER", time: 0, membersCount: 3, issuersCount: 2, issuersFrame: 1, issuersFrameVar: 2, avgBlockSize: 0, medianTime: 1482500000, dividend: 100, mass: 300, massReeval: 300, unitBase: 2, powMin: 70, udTime: 0, udReevalTime: 0, diffNumber: 5, speed: 1.0 },
      { number: 123, version: 6, bsize: 0, hash: "HASH", issuer: "ISSUER", time: 0, membersCount: 3, issuersCount: 2, issuersFrame: 1, issuersFrameVar: 2, avgBlockSize: 0, medianTime: 1482500000, dividend: 100, mass: 300, massReeval: 300, unitBase: 2, powMin: 70, udTime: 0, udReevalTime: 0, diffNumber: 5, speed: 1.0 },
      { number: 124, version: 6, bsize: 0, hash: "HASH", issuer: "ISSUER", time: 0, membersCount: 3, issuersCount: 2, issuersFrame: 1, issuersFrameVar: 2, avgBlockSize: 0, medianTime: 1482500000, dividend: 100, mass: 300, massReeval: 300, unitBase: 2, powMin: 70, udTime: 0, udReevalTime: 0, diffNumber: 5, speed: 1.0 },
      { number: 125, version: 6, bsize: 0, hash: "HASH", issuer: "ISSUER", time: 0, membersCount: 3, issuersCount: 2, issuersFrame: 1, issuersFrameVar: 2, avgBlockSize: 0, medianTime: 1482500000, dividend: 100, mass: 300, massReeval: 300, unitBase: 2, powMin: 70, udTime: 0, udReevalTime: 0, diffNumber: 5, speed: 1.0 }
    ] as any);
  })

  it('should have bindex head(1) = 125', async () => {
    const head = await dal.bindexDAL.head(1);
    head.should.have.property('number').equal(125);
  })

  it('should have bindex range(1, 3) = 125, 124, 123', async () => {
    const range = await dal.bindexDAL.range(1,3);
    range.should.have.length(3);
    range[0].should.have.property('number').equal(125);
    range[1].should.have.property('number').equal(124);
    range[2].should.have.property('number').equal(123);
  })

  it('should be able to feed the iindex', async () => {
    await dal.iindexDAL.insertBatch([
      { op: 'CREATE', pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', uid: 'cat', created_on: '121-H', written_on: '122-H', writtenOn: 122, member: true,  wasMember: true, kick: false },
      { op: 'UPDATE', pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', uid: null,  created_on: '121-H', written_on: '123-H', writtenOn: 123, member: null,  wasMember: null, kick: true },
      { op: 'UPDATE', pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', uid: null,  created_on: '121-H', written_on: '124-H', writtenOn: 124, member: false, wasMember: null, kick: false }
    ] as any);
    let lignes = await dal.iindexDAL.reducable('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
    lignes.should.have.length(3);
    Indexer.DUP_HELPERS.reduce(lignes).should.have.property('member').equal(false);
  })

  it('should be able to trim the iindex', async () => {
    // Triming
    await dal.trimIndexes(124);
    const lignes = await dal.iindexDAL.reducable('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
    lignes.should.have.length(2);
    Indexer.DUP_HELPERS.reduce(lignes).should.have.property('member').equal(false);
  })

  it('triming again the iindex should have no effet', async () => {
    // Triming
    await dal.trimIndexes(124);
    const lignes = await dal.iindexDAL.reducable('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
    lignes.should.have.length(2);
    Indexer.DUP_HELPERS.reduce(lignes).should.have.property('member').equal(false);
  })

  it('should be able to feed the mindex', async () => {
    await dal.mindexDAL.insertBatch([
      { op: 'CREATE', pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', created_on: '121-H', written_on: '122-H', writtenOn: 122, expires_on: 1000, expired_on: null },
      { op: 'UPDATE', pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', created_on: '121-H', written_on: '123-H', writtenOn: 123, expires_on: 1200, expired_on: null },
      { op: 'UPDATE', pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', created_on: '121-H', written_on: '124-H', writtenOn: 124, expires_on: null, expired_on: null },
      { op: 'UPDATE', pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', created_on: '121-H', written_on: '125-H', writtenOn: 125, expires_on: 1400, expired_on: null }
    ] as any);
    const lignes = await dal.mindexDAL.reducable('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
    lignes.should.have.length(4);
    Indexer.DUP_HELPERS.reduce(lignes).should.have.property('expires_on').equal(1400);
  })

  it('should be able to trim the mindex', async () => {
    // Triming
    await dal.trimIndexes(124);
    const lignes = await dal.mindexDAL.reducable('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
    lignes.should.have.length(3);
    Indexer.DUP_HELPERS.reduce(lignes).should.have.property('expires_on').equal(1400);
  })

  it('should be able to feed the cindex', async () => {
    await dal.cindexDAL.insertBatch([
      { op: 'CREATE', issuer: 'HgTT', receiver: 'DNan', created_on: '121-H', written_on: '126-H', writtenOn: 126, expires_on: 1000, expired_on: null },
      { op: 'UPDATE', issuer: 'HgTT', receiver: 'DNan', created_on: '121-H', written_on: '126-H', writtenOn: 126, expires_on: null, expired_on: 3000 },
      { op: 'CREATE', issuer: 'DNan', receiver: 'HgTT', created_on: '125-H', written_on: '126-H', writtenOn: 126, expires_on: null, expired_on: null }
    ] as any);
    (await dal.cindexDAL.findRaw({ issuer: 'HgTT' })).should.have.length(2);
    (await dal.cindexDAL.findRaw({ issuer: 'DNan' })).should.have.length(1);
  })

  it('should be able to trim the cindex', async () => {
    // Triming
    await dal.trimIndexes(127);
    (await dal.cindexDAL.findRaw({ issuer: 'HgTT' })).should.have.length(0);
    // { op: 'UPDATE', issuer: 'DNan', receiver: 'HgTT', created_on: '125-H', written_on: '126-H', writtenOn: 126, expires_on: 3600, expired_on: null },/**/
    (await dal.cindexDAL.findRaw({ issuer: 'DNan' })).should.have.length(1);
  })

  it('should be able to feed the sindex', async () => {
    await dal.sindexDAL.insertBatch([
      { op: 'CREATE', identifier: 'SOURCE_1', pos: 4, written_on: '126-H', writtenOn: 126, written_time: 2000, consumed: false },
      { op: 'UPDATE', identifier: 'SOURCE_1', pos: 4, written_on: '139-H', writtenOn: 139, written_time: 4500, consumed: true },
      { op: 'CREATE', identifier: 'SOURCE_2', pos: 4, written_on: '126-H', writtenOn: 126, written_time: 2000, consumed: false },
      { op: 'CREATE', identifier: 'SOURCE_3', pos: 4, written_on: '126-H', writtenOn: 126, written_time: 2000, consumed: false }
    ] as any);
    (await dal.sindexDAL.findRaw({ identifier: 'SOURCE_1' })).should.have.length(2);
    (await dal.sindexDAL.findRaw({ pos: 4 })).should.have.length(4);
  })

  it('should be able to trim the sindex', async () => {
    // Triming
    await dal.trimIndexes(140);
    (await dal.sindexDAL.findRaw({ identifier: 'SOURCE_1' })).should.have.length(0);
    (await dal.sindexDAL.findRaw({ pos: 4 })).should.have.length(2);
  })

  it('should be able to trim the bindex', async () => {
    // Triming
    const server = (await simpleNodeWith2Users({
      forksize: 9,
      sigQty: 1,
      dtDiffEval: 2,
      medianTimeBlocks: 3
    })).s1;
    // const s1 = server.s1;
    for (let i = 0; i < 13; i++) {
      await server.commit();
    }
    (await server.dal.bindexDAL.head(1)).should.have.property('number').equal(12);
    (await server.dal.bindexDAL.head(13)).should.have.property('number').equal(0);
    await server.commit();
    should.not.exists(await server.dal.bindexDAL.head(14)); // Trimed

    await server.closeCluster()
  })
})
