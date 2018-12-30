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

import {AbstractIndex} from "../AbstractIndex"
import {SQLiteDriver} from "../../drivers/SQLiteDriver"
import {CindexEntry} from "../../../indexer"
import {CommonConstants} from "../../../common-libs/constants"

const indexer         = require('../../../indexer').Indexer

export class CIndexDAL extends AbstractIndex<CindexEntry> {

  constructor(driver:SQLiteDriver) {
    super(
      driver,
      'c_index',
      // PK fields
      ['op', 'issuer', 'receiver', 'written_on'],
      // Fields
      [
        'op',
        'issuer',
        'receiver',
        'created_on',
        'written_on',
        'writtenOn',
        'sig',
        'expires_on',
        'expired_on',
        'chainable_on',
        'replayable_on',
        'from_wid',
        'to_wid'
      ],
      // Arrays
      [],
      // Booleans
      [],
      // BigIntegers
      [],
      // Transient
      []
    )
  }

  async init() {
    await this.exec('BEGIN;' +
      'CREATE TABLE IF NOT EXISTS ' + this.table + ' (' +
      'op VARCHAR(10) NOT NULL,' +
      'issuer VARCHAR(50) NOT NULL,' +
      'receiver VARCHAR(50) NOT NULL,' +
      'created_on VARCHAR(80) NOT NULL,' +
      'written_on VARCHAR(80) NOT NULL,' +
      'sig VARCHAR(100) NULL,' +
      'expires_on INTEGER NULL,' +
      'expired_on INTEGER NULL,' +
      'chainable_on INTEGER NULL,' +
      'from_wid INTEGER NULL,' +
      'to_wid INTEGER NULL,' +
      'PRIMARY KEY (op,issuer,receiver,written_on)' +
      ');' +
      'CREATE INDEX IF NOT EXISTS idx_cindex_issuer ON c_index (issuer);' +
      'CREATE INDEX IF NOT EXISTS idx_cindex_receiver ON c_index (receiver);' +
      'CREATE INDEX IF NOT EXISTS idx_cindex_chainable_on ON c_index (chainable_on);' +
      'COMMIT;')
  }

  async reducablesFrom(from:string) {
    const reducables = await this.query('SELECT * FROM ' + this.table + ' WHERE issuer = ? ORDER BY CAST(written_on as integer) ASC', [from]);
    return indexer.DUP_HELPERS.reduceBy(reducables, ['issuer', 'receiver']);
  }

  async trimExpiredCerts(belowNumber:number) {
    // Don't trim.
    // Duniter 1.6 is not going to be optimized, 1.7 does it already.
    // So CIndex will just accumulate certificatios.
  }

  getWrittenOn(blockstamp:string) {
    return this.sqlFind({ written_on: blockstamp })
  }

  findExpired(medianTime:number) {
    return this.query('SELECT * FROM ' + this.table + ' c1 WHERE c1.expires_on <= ? ' +
      'AND NOT EXISTS (' +
      ' SELECT * FROM c_index c2' +
      ' WHERE c1.issuer = c2.issuer' +
      ' AND c1.receiver = c2.receiver' +
      ' AND c2.writtenOn > c1.writtenOn' +
      ' AND c2.expired_on IS NOT NULL' +
      ') ' +
      'AND NOT EXISTS (' +
      ' SELECT * FROM c_index c3' +
      ' WHERE c1.issuer = c3.issuer' +
      ' AND c1.receiver = c3.receiver' +
      ' AND c3.writtenOn > c1.writtenOn' +
      ' AND c3.replayable_on IS NOT NULL' +
      ')', [medianTime])
  }

  async findByIssuer(issuer:string) {
    return this.query('SELECT * FROM ' + this.table + ' c1 WHERE c1.issuer = ? ORDER BY CAST(written_on as integer) ASC', [issuer])
  }

  async getValidLinksTo(receiver:string) {
    const reducables = await this.query('SELECT * FROM ' + this.table + ' c1 WHERE c1.receiver = ? ORDER BY CAST(written_on as integer) ASC', [receiver])
    return indexer.DUP_HELPERS.reduceBy(reducables, ['issuer', 'receiver'])
      .filter((c:CindexEntry) => !c.expired_on)
  }

  async getValidLinksFrom(issuer:string) {
    const reducables = await this.query('SELECT * FROM ' + this.table + ' c1 WHERE c1.issuer = ? ORDER BY CAST(written_on as integer) ASC', [issuer])
    return indexer.DUP_HELPERS.reduceBy(reducables, ['issuer', 'receiver'])
      .filter((c:CindexEntry) => !c.expired_on)
  }

  async existsNonReplayableLink(issuer:string, receiver:string, medianTime: number, version: number) {
    const reducables = await this.query('SELECT * FROM ' + this.table + ' c1 ' +
      'WHERE c1.issuer = ? ' +
      'AND c1.receiver = ?' +
      'ORDER BY CAST(written_on as integer) ASC', [issuer, receiver])
    if (reducables.length === 0) {
      return false
    }
    const link = indexer.DUP_HELPERS.reduce(reducables)
    let replayable: boolean
    if (version <= 10) {
      replayable = !!link.expired_on
    } else {
      replayable = !!link.expired_on || link.replayable_on < medianTime
    }
    return !replayable
  }

  removeBlock(blockstamp:string) {
    return this.exec('DELETE FROM ' + this.table + ' WHERE written_on = \'' + blockstamp + '\'')
  }
}
