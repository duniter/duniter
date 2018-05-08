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

const should = require('should');

let dal:FileDAL

describe("Source DAL", function(){

  before(async () => {
    dal = new FileDAL(await Directory.getHomeParams(true, 'db0'));
    await dal.init({} as any)
  })

  it('should be able to feed the sindex with unordered rows', async () => {
    await dal.sindexDAL.insertBatch([
      { op: 'UPDATE', tx: null, identifier: 'SOURCE_1', pos: 4, written_on: '139-H', writtenOn: 139, written_time: 4500, consumed: true,  conditions: 'SIG(ABC)' },
      { op: 'CREATE', tx: null, identifier: 'SOURCE_1', pos: 4, written_on: '126-H', writtenOn: 126, written_time: 2000, consumed: false, conditions: 'SIG(ABC)' },
      { op: 'CREATE', tx: null, identifier: 'SOURCE_2', pos: 4, written_on: '126-H', writtenOn: 126, written_time: 2000, consumed: false, conditions: 'SIG(ABC)' },
      { op: 'CREATE', tx: null, identifier: 'SOURCE_3', pos: 4, written_on: '126-H', writtenOn: 126, written_time: 2000, consumed: false, conditions: 'SIG(DEF)' }
    ] as any);
    (await dal.sindexDAL.findRaw({ identifier: 'SOURCE_1' })).should.have.length(2);
    (await dal.sindexDAL.findRaw({ pos: 4 })).should.have.length(4);
    // Source availability
    const sourcesOfDEF = await dal.sindexDAL.getAvailableForPubkey('DEF');
    sourcesOfDEF.should.have.length(1);
    const sourcesOfABC = await dal.sindexDAL.getAvailableForPubkey('ABC');
    sourcesOfABC.should.have.length(1);
    const source1 = await dal.sindexDAL.getSource('SOURCE_1', 4) as any
    source1.should.have.property('consumed').equal(true);
    const udSources = await dal.sindexDAL.getUDSources('ABC');
    udSources.should.have.length(2);
    udSources[0].should.have.property('consumed').equal(false);
    udSources[1].should.have.property('consumed').equal(true);
  })
})
