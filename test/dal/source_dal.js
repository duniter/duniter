"use strict";
const co = require('co');
const should = require('should');
const FileDAL = require('../../app/lib/dal/fileDAL');
const dir = require('../../app/lib/system/directory');
const indexer = require('../../app/lib/dup/indexer');
const toolbox = require('../integration/tools/toolbox');

let dal;

describe("Source DAL", function(){

  before(() => co(function *() {
    dal = FileDAL(yield dir.getHomeParams(true, 'db0'));
    yield dal.init();
  }));

  it('should be able to feed the sindex with unordered rows', () => co(function *() {
    yield dal.sindexDAL.insertBatch([
      { op: 'UPDATE', identifier: 'SOURCE_1', pos: 4, written_on: '139-H', written_time: 4500, consumed: true,  conditions: 'SIG(ABC)' },
      { op: 'CREATE', identifier: 'SOURCE_1', pos: 4, written_on: '126-H', written_time: 2000, consumed: false, conditions: 'SIG(ABC)' },
      { op: 'CREATE', identifier: 'SOURCE_2', pos: 4, written_on: '126-H', written_time: 2000, consumed: false, conditions: 'SIG(ABC)' },
      { op: 'CREATE', identifier: 'SOURCE_3', pos: 4, written_on: '126-H', written_time: 2000, consumed: false, conditions: 'SIG(DEF)' }
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
