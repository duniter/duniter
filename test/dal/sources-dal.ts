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

describe("Source DAL", function() {
  const pubkeyA = 'BYfWYFrsyjpvpFysgu19rGK3VHBkz4MqmQbNyEuVU64g';
  const pubkeyB = 'DSz4rgncXCytsUMW2JU2yhLquZECD2XpEkpP9gG5HyAx';

  before(async () => {
    dal = new FileDAL(await Directory.getHomeParams(true, 'db0'), async (name: string) => Directory.getHomeDB(true, name), async (name: string) => Directory.getHomeLevelDB(true, name))
    await dal.init({} as any)
  })

  it('should be able to fill the sindex with unordered rows', async () => {
    await dal.sindexDAL.insertBatch([
      { op: 'UPDATE', tx: null, identifier: 'SOURCE_1', pos: 4, written_on: '139-H', writtenOn: 139, written_time: 4500, consumed: true,  conditions: `SIG(${pubkeyA})` },
      { op: 'CREATE', tx: null, identifier: 'SOURCE_1', pos: 4, written_on: '126-H', writtenOn: 126, written_time: 2000, consumed: false, conditions: `SIG(${pubkeyA})` },
      { op: 'CREATE', tx: null, identifier: 'SOURCE_2', pos: 4, written_on: '126-H', writtenOn: 126, written_time: 2000, consumed: false, conditions: `SIG(${pubkeyA})` },
      { op: 'CREATE', tx: null, identifier: 'SOURCE_3', pos: 4, written_on: '126-H', writtenOn: 126, written_time: 2000, consumed: false, conditions: `SIG(${pubkeyB})` }
    ] as any);
    (await dal.sindexDAL.findByIdentifier('SOURCE_1')).should.have.length(2);
    (await dal.sindexDAL.findByPos(4)).should.have.length(4);
    // Source availability
    const sourcesOfA = await dal.sindexDAL.getAvailableForPubkey(pubkeyA);
    sourcesOfA.should.have.length(1);
    const sourcesOfB = await dal.sindexDAL.getAvailableForPubkey(pubkeyB);
    sourcesOfB.should.have.length(1);
    const source1 = await dal.sindexDAL.getTxSource('SOURCE_1', 4) as any
    source1.should.have.property('consumed').equal(true);
    const source2 = await dal.sindexDAL.getTxSource('SOURCE_2', 4) as any
    source2.should.have.property('consumed').equal(false);

    // Check sources not available after block deletion
    await dal.sindexDAL.removeBlock('126-H');
    (await dal.sindexDAL.findByIdentifier('SOURCE_1')).should.have.length(1);
    should(await dal.sindexDAL.getTxSource('SOURCE_2', 4) as any).be.null();
    should(await dal.sindexDAL.getTxSource('SOURCE_3', 4) as any).be.null();
    (await dal.sindexDAL.findByPos(4)).should.have.length(1);
    await dal.sindexDAL.removeBlock('139-H');
    (await dal.sindexDAL.findByIdentifier('SOURCE_1')).should.have.length(0);
    (await dal.sindexDAL.findByPos(4)).should.have.length(0);
    (await dal.sindexDAL.getAvailableForPubkey(pubkeyA)).should.have.length(0);
    (await dal.sindexDAL.getAvailableForPubkey(pubkeyB)).should.have.length(0);
    should(await dal.sindexDAL.getTxSource('SOURCE_1', 4) as any).be.null();
    should(await dal.sindexDAL.getTxSource('SOURCE_2', 4) as any).be.null();
    should(await dal.sindexDAL.getTxSource('SOURCE_3', 4) as any).be.null();
  })

  it('should be able to read sindex by pubkey', async () => {
    // Test insertion, using complex condition
    await dal.sindexDAL.insertBatch([
      { op: 'CREATE', tx: null, identifier: 'SOURCE_4', pos: 4, written_on: '139-H', writtenOn: 139, written_time: 2000, consumed: false, conditions: `SIG(${pubkeyA})` },
      { op: 'CREATE', tx: null, identifier: 'SOURCE_5', pos: 4, written_on: '126-H', writtenOn: 126, written_time: 2000, consumed: false, conditions: `(SIG(${pubkeyA}) && SIG(${pubkeyB}))` },
      { op: 'CREATE', tx: null, identifier: 'SOURCE_6', pos: 4, written_on: '126-H', writtenOn: 126, written_time: 2000, consumed: false, conditions: `(XHX(3EB4702F2AC2FD3FA4FDC46A4FC05AE8CDEE1A85F2AC2FD3FA4FDC46A4FC01CA) || SIG(${pubkeyB}))` }
    ] as any);

    // Check sources availability by pubkey
    let sourcesOfA = await dal.sindexDAL.getAvailableForPubkey(pubkeyA);
    sourcesOfA.should.have.length(2);
    let sourcesOfB = await dal.sindexDAL.getAvailableForPubkey(pubkeyB);
    sourcesOfB.should.have.length(2);

    // Check sources not available after block deletion
    await dal.sindexDAL.removeBlock('126-H');
    await dal.sindexDAL.removeBlock('139-H');
    sourcesOfA = await dal.sindexDAL.getAvailableForPubkey(pubkeyA);
    sourcesOfA.should.have.length(0);
    sourcesOfB = await dal.sindexDAL.getAvailableForPubkey(pubkeyB);
    sourcesOfB.should.have.length(0);
  })
})
