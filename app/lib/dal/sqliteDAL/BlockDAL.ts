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

import {AbstractSQLite} from "./AbstractSQLite"
import {SQLiteDriver} from "../drivers/SQLiteDriver"
import {DBBlock} from "../../db/DBBlock"

const constants = require('../../constants');

const IS_FORK = true;
const IS_NOT_FORK = false;

export class BlockDAL extends AbstractSQLite<DBBlock> {

  private current: DBBlock|null

  constructor(driver:SQLiteDriver) {
    super(
      driver,
      'block',
      // PK fields
      ['number','hash'],
      // Fields
      ['fork', 'hash', 'inner_hash', 'signature', 'currency', 'issuer', 'issuersCount', 'issuersFrame', 'issuersFrameVar', 'parameters', 'previousHash', 'previousIssuer', 'version', 'membersCount', 'monetaryMass', 'UDTime', 'medianTime', 'dividend', 'unitbase', 'time', 'powMin', 'number', 'nonce', 'transactions', 'certifications', 'identities', 'joiners', 'actives', 'leavers', 'revoked', 'excluded', 'len'],
      // Arrays
      ['identities','certifications','actives','revoked','excluded','leavers','joiners','transactions'],
      // Booleans
      ['wrong'],
      // BigIntegers
      ['monetaryMass'],
      // Transient
      []
    )

    /**
     * Periodically cleans the current block cache.
     * It seems the cache is not always correct and may stuck the node, so it is preferable to reset it periodically.
     */
    setInterval(this.cleanCache, constants.CURRENT_BLOCK_CACHE_DURATION);
  }

  async init() {
    await this.exec('BEGIN;' +
      'CREATE TABLE IF NOT EXISTS ' + this.table + ' (' +
      'fork BOOLEAN NOT NULL,' +
      'hash VARCHAR(64) NOT NULL,' +
      'inner_hash VARCHAR(64) NOT NULL,' +
      'signature VARCHAR(100) NOT NULL,' +
      'currency VARCHAR(50) NOT NULL,' +
      'issuer VARCHAR(50) NOT NULL,' +
      'parameters VARCHAR(255),' +
      'previousHash VARCHAR(64),' +
      'previousIssuer VARCHAR(50),' +
      'version INTEGER NOT NULL,' +
      'membersCount INTEGER NOT NULL,' +
      'monetaryMass VARCHAR(100) DEFAULT \'0\',' +
      'UDTime DATETIME,' +
      'medianTime DATETIME NOT NULL,' +
      'dividend INTEGER DEFAULT \'0\',' +
      'unitbase INTEGER NULL,' +
      'time DATETIME NOT NULL,' +
      'powMin INTEGER NOT NULL,' +
      'number INTEGER NOT NULL,' +
      'nonce INTEGER NOT NULL,' +
      'transactions TEXT,' +
      'certifications TEXT,' +
      'identities TEXT,' +
      'joiners TEXT,' +
      'actives TEXT,' +
      'leavers TEXT,' +
      'revoked TEXT,' +
      'excluded TEXT,' +
      'created DATETIME DEFAULT NULL,' +
      'updated DATETIME DEFAULT NULL,' +
      'PRIMARY KEY (number,hash)' +
      ');' +
      'CREATE INDEX IF NOT EXISTS idx_block_hash ON block (hash);' +
      'CREATE INDEX IF NOT EXISTS idx_block_fork ON block (fork);' +
      'COMMIT;')
  }

  cleanCache() {
    this.current = null
  }

  async getCurrent() {
    if (!this.current) {
      this.current = (await this.query('SELECT * FROM block WHERE NOT fork ORDER BY number DESC LIMIT 1'))[0];
    }
    return this.current
  }

  async getBlock(number:string | number): Promise<DBBlock|null> {
    return (await this.query('SELECT * FROM block WHERE number = ? and NOT fork', [parseInt(String(number))]))[0];
  }

  async getAbsoluteBlock(number:number, hash:string): Promise<DBBlock|null> {
    return (await this.query('SELECT * FROM block WHERE number = ? and hash = ?', [number, hash]))[0];
  }

  getBlocks(start:number, end:number) {
    return this.query('SELECT * FROM block WHERE number BETWEEN ? and ? and NOT fork ORDER BY number ASC', [start, end]);
  }

  async lastBlockWithDividend() {
    return (await this.query('SELECT * FROM block WHERE dividend > 0 and NOT fork ORDER BY number DESC LIMIT 1'))[0];
  }

  async lastBlockOfIssuer(issuer:string) {
    return (await this.query('SELECT * FROM block WHERE issuer = ? and NOT fork ORDER BY number DESC LIMIT 1', [issuer]))[0]
  }

  async getCountOfBlocksIssuedBy(issuer:string) {
    let res: any = await this.query('SELECT COUNT(*) as quantity FROM block WHERE issuer = ? and NOT fork', [issuer]);
    return res[0].quantity;
  }

  getForkBlocks() {
    return this.query('SELECT * FROM block WHERE fork ORDER BY number');
  }

  getPotentialForkBlocks(numberStart:number, medianTimeStart:number, maxNumber:number) {
    return this.query('SELECT * FROM block WHERE fork AND number >= ? AND number <= ? AND medianTime >= ? ORDER BY number DESC', [numberStart, maxNumber, medianTimeStart]);
  }

  getPotentialRoots() {
    return this.query('SELECT * FROM block WHERE fork AND number = ?', [0])
  }

  getDividendBlocks() {
    return this.query('SELECT * FROM block WHERE dividend IS NOT NULL ORDER BY number');
  }

  async saveBunch(blocks:DBBlock[]) {
    let queries = "INSERT INTO block (" + this.fields.join(',') + ") VALUES ";
    for (let i = 0, len = blocks.length; i < len; i++) {
      let block = blocks[i];
      queries += this.toInsertValues(block);
      if (i + 1 < len) {
        queries += ",\n";
      }
    }
    await this.exec(queries);
    this.cleanCache();
  }

  async saveBlock(block:DBBlock) {
    let saved = await this.saveBlockAs(block, IS_NOT_FORK);
    if (!this.current || this.current.number < block.number) {
      this.current = block;
    }
    return saved;
  }

  saveSideBlock(block:DBBlock) {
    return this.saveBlockAs(block, IS_FORK)
  }

  private async saveBlockAs(block:DBBlock, fork:boolean) {
    block.fork = fork;
    return await this.saveEntity(block);
  }

  async setSideBlock(number:number, previousBlock:DBBlock|null) {
    await this.query('UPDATE block SET fork = ? WHERE number = ?', [true, number]);
    this.current = previousBlock;
  }

  getNextForkBlocks(number:number, hash:string) {
    return this.query('SELECT * FROM block WHERE fork AND number = ? AND previousHash like ? ORDER BY number', [number + 1, hash]);
  }
}
