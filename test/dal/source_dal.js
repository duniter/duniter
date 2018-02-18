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

"use strict";
const co = require('co');
const should = require('should');
const FileDAL = require('../../app/lib/dal/fileDAL').FileDAL
const dir = require('../../app/lib/system/directory');
const indexer    = require('../../app/lib/indexer').Indexer

let dal;

describe("Source DAL", function(){

  before(() => co(function *() {
    dal = new FileDAL(yield dir.getHomeParams(true, 'db0'));
    yield dal.init();
  }));

  it('should be able to feed the sindex with unordered rows', () => co(function *() {
    yield dal.sindexDAL.insertBatch([
      { op: 'UPDATE', identifier: 'SOURCE_1', pos: 4, written_on: '139-H', writtenOn: 139, written_time: 4500, consumed: true,  conditions: 'SIG(ABC)' },
      { op: 'CREATE', identifier: 'SOURCE_1', pos: 4, written_on: '126-H', writtenOn: 126, written_time: 2000, consumed: false, conditions: 'SIG(ABC)' },
      { op: 'CREATE', identifier: 'SOURCE_2', pos: 4, written_on: '126-H', writtenOn: 126, written_time: 2000, consumed: false, conditions: 'SIG(ABC)' },
      { op: 'CREATE', identifier: 'SOURCE_3', pos: 4, written_on: '126-H', writtenOn: 126, written_time: 2000, consumed: false, conditions: 'SIG(DEF)' }
    ]);
    (yield dal.sindexDAL.sqlFind({ identifier: 'SOURCE_1' })).should.have.length(2);
    (yield dal.sindexDAL.sqlFind({ pos: 4 })).should.have.length(4);
    // Source availability
    const sourcesOfDEF = yield dal.sindexDAL.getAvailableForPubkey('DEF');
    sourcesOfDEF.should.have.length(1);
    const sourcesOfABC = yield dal.sindexDAL.getAvailableForPubkey('ABC');
    sourcesOfABC.should.have.length(1);
    const source1 = yield dal.sindexDAL.getSource('SOURCE_1', 4);
    source1.should.have.property('consumed').equal(true);
    const udSources = yield dal.sindexDAL.getUDSources('ABC');
    udSources.should.have.length(2);
    udSources[0].should.have.property('consumed').equal(true);
    udSources[1].should.have.property('consumed').equal(false);
  }));
});
