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
import {ConfDTO} from "../../dto/ConfDTO"
import {TransactionDTO} from "../../dto/TransactionDTO"
import {IdentityDAL} from "./IdentityDAL"

const logger = require('../../logger').NewLogger('metaDAL');

export interface DBMeta {
  id: number,
  version: number
}

export class MetaDAL extends AbstractSQLite<DBMeta> {

  driverCopy:SQLiteDriver

  constructor(driver:SQLiteDriver) {
    super(
      driver,
      'meta',
      // PK fields
      ['version'],
      // Fields
      [
        'id',
        'version'
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
    this.driverCopy = driver
  }

  private migrations:any = {

    // Test
    0: 'BEGIN;' +

    // This table was initially created by BlockDAL, but now it has been removed so we keep it here
    // to keep the unit tests work
    'CREATE TABLE IF NOT EXISTS block (' +
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

    // Same, but for Transactions
    'CREATE TABLE IF NOT EXISTS txs (' +
    'hash CHAR(64) NOT NULL,' +
    'block_number INTEGER,' +
    'locktime INTEGER NOT NULL,' +
    'version INTEGER NOT NULL,' +
    'currency VARCHAR(50) NOT NULL,' +
    'comment VARCHAR(255) NOT NULL,' +
    'time DATETIME,' +
    'inputs TEXT NOT NULL,' +
    'unlocks TEXT NOT NULL,' +
    'outputs TEXT NOT NULL,' +
    'issuers TEXT NOT NULL,' +
    'signatures TEXT NOT NULL,' +
    'recipients TEXT NOT NULL,' +
    'written BOOLEAN NOT NULL,' +
    'removed BOOLEAN NOT NULL,' +
    'PRIMARY KEY (hash)' +
    ');' +
    'CREATE INDEX IF NOT EXISTS idx_txs_issuers ON txs (issuers);' +
    'CREATE INDEX IF NOT EXISTS idx_txs_written ON txs (written);' +
    'CREATE INDEX IF NOT EXISTS idx_txs_removed ON txs (removed);' +
    'CREATE INDEX IF NOT EXISTS idx_txs_hash ON txs (hash);' +

    'COMMIT;',

    // Test
    1: 'BEGIN;' +
    'CREATE VIEW IF NOT EXISTS identities_pending AS SELECT * FROM idty WHERE NOT written;' +
    'CREATE VIEW IF NOT EXISTS certifications_pending AS SELECT * FROM cert WHERE NOT written;' +
    'CREATE VIEW IF NOT EXISTS transactions_pending AS SELECT * FROM txs WHERE NOT written;' +
    'CREATE VIEW IF NOT EXISTS transactions_desc AS SELECT * FROM txs ORDER BY time DESC;' +
    'CREATE VIEW IF NOT EXISTS forks AS SELECT number, hash, issuer, monetaryMass, dividend, UDTime, membersCount, medianTime, time, * FROM block WHERE fork ORDER BY number DESC;' +
    'CREATE VIEW IF NOT EXISTS blockchain AS SELECT number, hash, issuer, monetaryMass, dividend, UDTime, membersCount, medianTime, time, * FROM block WHERE NOT fork ORDER BY number DESC;' +
    'CREATE VIEW IF NOT EXISTS network AS select i.uid, (last_try - first_down) / 1000 as down_delay_in_sec, p.* from peer p LEFT JOIN idty i on i.pubkey = p.pubkey ORDER by down_delay_in_sec;' +
    'COMMIT;',

    // New `receveid` column
    2: 'BEGIN; ALTER TABLE txs ADD COLUMN received INTEGER NULL; COMMIT;',

    // Update wrong recipients field (was not filled in)
    3: async () => {},

    // Migrates wrong unitbases
    4: async () => {},

    // Migrates wrong monetary masses
    5: async () => {},

    6: 'BEGIN; ALTER TABLE idty ADD COLUMN expired INTEGER NULL; COMMIT;',
    7: 'BEGIN; ALTER TABLE cert ADD COLUMN expired INTEGER NULL; COMMIT;',
    8: 'BEGIN; ALTER TABLE membership ADD COLUMN expired INTEGER NULL; COMMIT;',
    9: 'BEGIN;' +
    'ALTER TABLE txs ADD COLUMN output_base INTEGER NULL;' +
    'ALTER TABLE txs ADD COLUMN output_amount INTEGER NULL;' +
    'COMMIT;',
    10: 'BEGIN; ALTER TABLE txs ADD COLUMN blockstamp VARCHAR(200) NULL; COMMIT;',
    11: 'BEGIN;' +
    'ALTER TABLE block ADD COLUMN issuersFrame INTEGER NULL;' +
    'ALTER TABLE block ADD COLUMN issuersFrameVar INTEGER NULL;' +
    'ALTER TABLE block ADD COLUMN issuersCount INTEGER NULL;' +
    'COMMIT;',
    12: async () => {
      let blockDAL = new MetaDAL(this.driverCopy)
      await blockDAL.exec('ALTER TABLE block ADD COLUMN len INTEGER NULL;');
      await blockDAL.exec('ALTER TABLE txs ADD COLUMN len INTEGER NULL;');
    },
    13: 'BEGIN; ALTER TABLE txs ADD COLUMN blockstampTime INTEGER NULL; COMMIT;',
    14: 'BEGIN; ' +
      
    'CREATE VIEW IF NOT EXISTS sandbox_txs AS SELECT * FROM txs WHERE NOT written AND NOT removed ORDER BY output_base DESC, output_amount DESC;' +
      
    'CREATE VIEW IF NOT EXISTS sandbox_idty AS SELECT ' +
      'I.*, ' +
      'I.hash, ' +
      '(SELECT COUNT(*) FROM cert C where C.target = I.hash) AS certsCount, ' +
      'CAST(SUBSTR(buid, 0, INSTR(buid, "-")) as number) AS ref_block ' +
      'FROM idty as I ' +
      'WHERE NOT I.member ' +
      'AND I.expired IS NULL ' +
      'ORDER BY certsCount DESC, ref_block DESC;' +
      
    'CREATE VIEW IF NOT EXISTS sandbox_memberships AS SELECT ' +
      '* ' +
      'FROM membership ' +
      'WHERE expired IS NULL ' +
      'AND written_number IS NULL ' +
      'ORDER BY blockNumber DESC;' +
      
    'CREATE VIEW IF NOT EXISTS sandbox_certs AS SELECT ' +
      '* ' +
      'FROM cert ' +
      'WHERE expired IS NULL ' +
      'AND written_block IS NULL ' +
      'ORDER BY block_number DESC;' +
    'COMMIT;',

    15: async () => {
      let idtyDAL = new IdentityDAL(this.driverCopy)
      await idtyDAL.exec('ALTER TABLE idty ADD COLUMN revoked_on INTEGER NULL');
    },

    16: async () => {},

    17: async () => {
      // This migration is now obsolete
    },

    18: 'BEGIN;' +
      // Add a `massReeval` column
    // 'ALTER TABLE b_index ADD COLUMN massReeval VARCHAR(100) NOT NULL DEFAULT \'0\';' +
    'COMMIT;',

    19: 'BEGIN;' +
      // Add a `removed` column
    'ALTER TABLE idty ADD COLUMN removed BOOLEAN NULL DEFAULT 0;' +
    'COMMIT;',

    /**
     * Feeds the table of wallets with balances
     */
    20: async () => {
    },

    21: async (conf:ConfDTO) => {
    },

    // Replay the wallet table feeding, because of a potential bug
    22: () => {
      return this.migrations[20]()
    },

    23: 'BEGIN;' +
    'COMMIT;',

    /**
     * Feeds the m_index.chainable_on correctly
     */
    24: async (conf:ConfDTO) => {
    },

    /**
     * Wrong transaction storage
     */
    25: async () => {
      const txsDAL:any = new MetaDAL(this.driverCopy)
      const wrongTXS = await txsDAL.query('SELECT * FROM txs WHERE outputs LIKE ? OR inputs LIKE ?', ['%amount%', '%amount%'])
      let i = 1
      for (const tx of wrongTXS) {
        logger.info('Updating incorrect transaction %s/%s.', i, wrongTXS.length)
        i++
        const dto = TransactionDTO.fromJSONObject(tx)
        dto.outputs = dto.outputs.map(o => {
          if (typeof o === 'object') {
            return TransactionDTO.outputObj2Str(o)
          }
          return o
        })
        dto.inputs = dto.inputs.map(o => {
          if (typeof o === 'object') {
            return TransactionDTO.inputObj2Str(o)
          }
          return o
        })
        await txsDAL.exec('UPDATE txs SET ' +
          'outputs = \'' + JSON.stringify(dto.outputs) + '\', ' +
          'inputs = \'' + JSON.stringify(dto.inputs) + '\' ' +
          'WHERE hash = \'' + tx.hash + '\'')
      }
    },
  };

  async init() {
    await this.exec('BEGIN;' +
      'CREATE TABLE IF NOT EXISTS ' + this.table + ' (' +
      'id INTEGER NOT NULL,' +
      'version INTEGER NOT NULL,' +
      'PRIMARY KEY (id)' +
      ');' +
      'COMMIT;')
  }

  private async executeMigration(migration: (string|((conf:ConfDTO)=>void)), conf:ConfDTO) {
    try {
      if (typeof migration == "string") {

        // Simple SQL script to pass
        await this.exec(migration);

      } else {

        // JS function to execute
        await migration(conf);

      }
    } catch (e) {
      logger.warn('An error occured during DB migration, continue.', e);
    }
  }

  async upgradeDatabase(conf:ConfDTO) {
    let version = await this.getVersion();
    while(this.migrations[version]) {
      await this.executeMigration(this.migrations[version], conf);
      // Automated increment
      await this.exec('UPDATE meta SET version = version + 1');
      version++;
    }
  }

  getRow() {
    return this.sqlFindOne({ id: 1 })
  }

  async getVersion() {
    try {
      const row = await this.getRow()
      return row.version;
    } catch(e) {
      await this.exec('INSERT INTO ' + this.table + ' VALUES (1,0);')
      return 0;
    }
  }

  cleanData() {
    // Never clean data of this table
    return Promise.resolve()
  }
}
