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

import {AbstractSQLite} from "../AbstractSQLite";
import {DBHead} from "../../../db/DBHead";
import {SQLiteDriver} from "../../drivers/SQLiteDriver";

export class BIndexDAL extends AbstractSQLite<DBHead> {

  constructor(driver:SQLiteDriver) {
    super(
      driver,
      'b_index',
      // PK fields
      ['number'],
      // Fields
      [
        'version',
        'bsize',
        'hash',
        'issuer',
        'time',
        'number',
        'membersCount',
        'issuersCount',
        'issuersFrame',
        'issuersFrameVar',
        'issuerDiff',
        'avgBlockSize',
        'medianTime',
        'dividend',
        'mass',
        'massReeval',
        'unitBase',
        'powMin',
        'udTime',
        'udReevalTime',
        'diffNumber',
        'speed'
      ],
      // Arrays
      [],
      // Booleans
      ['leaving'],
      // BigIntegers
      ['mass', 'massReeval'],
      // Transient
      []
    )
  }

  async init() {
    await this.exec('BEGIN;' +
      'CREATE TABLE IF NOT EXISTS ' + this.table + ' (' +
      'version INTEGER NOT NULL,' +
      'bsize INTEGER NOT NULL,' +
      'hash VARCHAR(64) NOT NULL,' +
      'issuer VARCHAR(50) NOT NULL,' +
      'time INTEGER NOT NULL,' +
      'number INTEGER NOT NULL,' +
      'membersCount INTEGER NOT NULL,' +
      'issuersCount INTEGER NOT NULL,' +
      'issuersFrame INTEGER NOT NULL,' +
      'issuersFrameVar INTEGER NOT NULL,' +
      'issuerDiff INTEGER NULL,' +
      'avgBlockSize INTEGER NOT NULL,' +
      'medianTime INTEGER NOT NULL,' +
      'dividend INTEGER NOT NULL,' +
      'mass VARCHAR(100) NOT NULL,' +
      'unitBase INTEGER NOT NULL,' +
      'powMin INTEGER NOT NULL,' +
      'udTime INTEGER NOT NULL,' +
      'udReevalTime INTEGER NOT NULL,' +
      'diffNumber INTEGER NOT NULL,' +
      'speed FLOAT NOT NULL,' +
      'PRIMARY KEY (number)' +
      ');' +
      'CREATE INDEX IF NOT EXISTS idx_bindex_number ON b_index (number);' +
      'CREATE INDEX IF NOT EXISTS idx_bindex_issuer ON b_index (issuer);' +
      'COMMIT;')
  }

  /**
   * Get HEAD~n
   * @param n Position
   */
  async head(n:number) {
    if (!n) {
      throw "Cannot read HEAD~0, which is the incoming block"
    }
    const headRecords = await this.query('SELECT * FROM ' + this.table + ' ORDER BY number DESC LIMIT 1 OFFSET ?', [n - 1]);
    return headRecords[0];
  }

  /**
   * Get the last record available in bindex
   */
  async tail() {
    const tailRecords = await this.query('SELECT * FROM ' + this.table + ' ORDER BY number ASC LIMIT 1', []);
    return tailRecords[0];
  }

  /**
   * Get HEAD~n..m
   * @param n
   * @param m
   */
  range(n:number, m:number) {
    const count = m - n + 1;
    return this.query('SELECT * FROM ' + this.table + ' ORDER BY number DESC LIMIT ? OFFSET ?', [count, n - 1]);
  }

  removeBlock(number:number) {
    return this.exec('DELETE FROM ' + this.table + ' WHERE number = ' + number)
  }

  trimBlocks(maxnumber:number) {
    return this.exec('DELETE FROM ' + this.table + ' WHERE number < ' + maxnumber)
  }
}
