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

import {SQLiteDriver} from "../../drivers/SQLiteDriver";
import {AbstractIndex} from "../AbstractIndex";
import {FullMindexEntry, Indexer, MindexEntry} from "../../../indexer";

export class MIndexDAL extends AbstractIndex<MindexEntry> {

  constructor(driver:SQLiteDriver) {
    super(
      driver,
      'm_index',
      // PK fields
      ['op', 'pub', 'created_on', 'written_on'],
      // Fields
      [
        'op',
        'pub',
        'created_on',
        'written_on',
        'writtenOn',
        'expires_on',
        'expired_on',
        'revokes_on',
        'revoked_on',
        'chainable_on',
        'leaving',
        'revocation'
      ],
      // Arrays
      [],
      // Booleans
      ['leaving'],
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
      'pub VARCHAR(50) NOT NULL,' +
      'created_on VARCHAR(80) NOT NULL,' +
      'written_on VARCHAR(80) NOT NULL,' +
      'expires_on INTEGER NULL,' +
      'expired_on INTEGER NULL,' +
      'revokes_on INTEGER NULL,' +
      'revoked_on INTEGER NULL,' +
      'leaving BOOLEAN NULL,' +
      'revocation VARCHAR(80) NULL,' +
      'PRIMARY KEY (op,pub,created_on,written_on)' +
      ');' +
      'CREATE INDEX IF NOT EXISTS idx_mindex_pub ON m_index (pub);' +
      'COMMIT;')
  }

  async getReducedMS(pub:string): Promise<FullMindexEntry|null> {
    const reducables = await this.reducable(pub);
    if (reducables.length) {
      return Indexer.DUP_HELPERS.reduce(reducables) as FullMindexEntry
    }
    return null
  }

  reducable(pub:string) {
    return this.query('SELECT * FROM ' + this.table + ' WHERE pub = ? ORDER BY CAST(written_on as integer) ASC', [pub])
}

  async removeBlock(blockstamp:string) {
    return this.exec('DELETE FROM ' + this.table + ' WHERE written_on = \'' + blockstamp + '\'')
  }

  async getRevokedPubkeys() {
    // All those who has been revoked. Make one result per pubkey.
    const revovedMemberships = await this.sqlFind({ revoked_on: { $null: false} });

    // Filter on those to be revoked, return their pubkey
    return revovedMemberships.map((entry:MindexEntry) => entry.pub);
  }
}
