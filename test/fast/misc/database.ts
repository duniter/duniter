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

import {SQLiteDriver} from "../../../app/lib/dal/drivers/SQLiteDriver"

const tmp = require('tmp')
const should = require('should')

const MEMORY = ':memory:';
const FILE = tmp.fileSync().name + '.db'; // We add an suffix to avoid Windows-locking of the file by the `tmp` module

const CREATE_TABLE_SQL = 'BEGIN;' +
  'CREATE TABLE IF NOT EXISTS duniter (' +
  'source VARCHAR(50) NOT NULL,' +
  'timestamp INTEGER NOT NULL,' +
  'block_number INTEGER NOT NULL,' +
  'obsolete BOOLEAN NOT NULL,' +
  'from_wotb_id INTEGER NULL,' +
  'to_wotb_id INTEGER NULL,' +
  'PRIMARY KEY (source,timestamp)' +
  ');' +
  'COMMIT;';

const SELECT_FROM_TABLE = 'SELECT * FROM duniter';

describe("SQLite driver", function() {

  describe("Memory", function() {

    let rows;

    it('should be openable and closable on will', async () => {
      const driver = new SQLiteDriver(MEMORY)
      await driver.executeSql(CREATE_TABLE_SQL);
      rows = await driver.executeAll(SELECT_FROM_TABLE, []);
      rows.should.have.length(0);

      try {
        // We close the memory database, it should not remember its state
        await driver.closeConnection();
        await driver.executeAll(SELECT_FROM_TABLE, []);
        throw 'Should have thrown an exception';
      } catch (err) {
        err.should.have.property('message').match(/SQLITE_ERROR: no such table: duniter/)
      }
      // But if we populate it again, it will work
      await driver.executeSql(CREATE_TABLE_SQL);
      rows = await driver.executeAll(SELECT_FROM_TABLE, []);
      rows.should.have.length(0);

      try {
        // We explicitely ask for destruction
        await driver.destroyDatabase();
        await driver.executeAll(SELECT_FROM_TABLE, []);
        throw 'Should have thrown an exception';
      } catch (err) {
        err.should.have.property('message').match(/SQLITE_ERROR: no such table: duniter/)
      }
      // But if we populate it again, it will work
      await driver.executeSql(CREATE_TABLE_SQL);
      rows = await driver.executeAll(SELECT_FROM_TABLE, []);
      rows.should.have.length(0);
    })
  });

  describe("File", function() {

    const driver = new SQLiteDriver(FILE);
    let rows;

    it('should be able to open a new one', async () => {
      await driver.executeSql(CREATE_TABLE_SQL);
      rows = await driver.executeAll(SELECT_FROM_TABLE, []);
      rows.should.have.length(0);
      await driver.closeConnection();
    })

    it('should be able to reopen the file', async () => {
      // Reopens the file
      rows = await driver.executeAll(SELECT_FROM_TABLE, []);
      rows.should.have.length(0);
    })

    it('should be able to remove the file', async () => {
      try {
        // We explicitely ask for destruction
        await driver.destroyDatabase();
        await driver.executeAll(SELECT_FROM_TABLE, []);
        throw 'Should have thrown an exception';
      } catch (err) {
        err.should.have.property('message').match(/SQLITE_ERROR: no such table: duniter/)
      }
    })

    it('should be able to open the file after being removed', async () => {
      // But if we populate it again, it will work
      await driver.executeSql(CREATE_TABLE_SQL);
      rows = await driver.executeAll(SELECT_FROM_TABLE, []);
      rows.should.have.length(0);
    })
  })
})
