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

import { AbstractSQLite } from "./AbstractSQLite";
import { SQLiteDriver } from "../drivers/SQLiteDriver";
import { ConfDTO } from "../../dto/ConfDTO";
import { TransactionDTO } from "../../dto/TransactionDTO";
import { IdentityDAL } from "./IdentityDAL";
import { SqliteTransactions } from "../indexDAL/sqlite/SqliteTransactions";
import { Directory } from "../../system/directory";

const constants = require("../../constants");
const logger = require("../../logger").NewLogger("metaDAL");

export interface DBMeta {
  id: number;
  version: number;
}

export class MetaDAL extends AbstractSQLite<DBMeta> {
  driverCopy: SQLiteDriver;

  constructor(
    driver: SQLiteDriver,
    private getSqliteDB: (dbName: string) => Promise<SQLiteDriver>
  ) {
    super(
      driver,
      "meta",
      // PK fields
      ["version"],
      // Fields
      ["id", "version"],
      // Arrays
      [],
      // Booleans
      [],
      // BigIntegers
      [],
      // Transient
      []
    );
    this.driverCopy = driver;
  }

  private migrations: any = {
    // Test
    0:
      "BEGIN;" +
      // This table was initially created by BlockDAL, but now it has been removed so we keep it here
      // to keep the unit tests work
      "CREATE TABLE IF NOT EXISTS block (" +
      "fork BOOLEAN NOT NULL," +
      "hash VARCHAR(64) NOT NULL," +
      "inner_hash VARCHAR(64) NOT NULL," +
      "signature VARCHAR(100) NOT NULL," +
      "currency VARCHAR(50) NOT NULL," +
      "issuer VARCHAR(50) NOT NULL," +
      "parameters VARCHAR(255)," +
      "previousHash VARCHAR(64)," +
      "previousIssuer VARCHAR(50)," +
      "version INTEGER NOT NULL," +
      "membersCount INTEGER NOT NULL," +
      "monetaryMass VARCHAR(100) DEFAULT '0'," +
      "UDTime DATETIME," +
      "medianTime DATETIME NOT NULL," +
      "dividend INTEGER DEFAULT '0'," +
      "unitbase INTEGER NULL," +
      "time DATETIME NOT NULL," +
      "powMin INTEGER NOT NULL," +
      "number INTEGER NOT NULL," +
      "nonce INTEGER NOT NULL," +
      "transactions TEXT," +
      "certifications TEXT," +
      "identities TEXT," +
      "joiners TEXT," +
      "actives TEXT," +
      "leavers TEXT," +
      "revoked TEXT," +
      "excluded TEXT," +
      "created DATETIME DEFAULT NULL," +
      "updated DATETIME DEFAULT NULL," +
      "PRIMARY KEY (number,hash)" +
      ");" +
      "CREATE INDEX IF NOT EXISTS idx_block_hash ON block (hash);" +
      "CREATE INDEX IF NOT EXISTS idx_block_fork ON block (fork);" +
      "COMMIT;",

    // Test
    1:
      "BEGIN;" +
      "CREATE VIEW IF NOT EXISTS identities_pending AS SELECT * FROM idty WHERE NOT written;" +
      "CREATE VIEW IF NOT EXISTS certifications_pending AS SELECT * FROM cert WHERE NOT written;" +
      "CREATE VIEW IF NOT EXISTS forks AS SELECT number, hash, issuer, monetaryMass, dividend, UDTime, membersCount, medianTime, time, * FROM block WHERE fork ORDER BY number DESC;" +
      "CREATE VIEW IF NOT EXISTS blockchain AS SELECT number, hash, issuer, monetaryMass, dividend, UDTime, membersCount, medianTime, time, * FROM block WHERE NOT fork ORDER BY number DESC;" +
      "CREATE VIEW IF NOT EXISTS network AS select i.uid, (last_try - first_down) / 1000 as down_delay_in_sec, p.* from peer p LEFT JOIN idty i on i.pubkey = p.pubkey ORDER by down_delay_in_sec;" +
      "COMMIT;",

    // New `receveid` column
    2: async () => {},

    // Update wrong recipients field (was not filled in)
    3: async () => {},

    // Migrates wrong unitbases
    4: async () => {},

    // Migrates wrong monetary masses
    5: async () => {},

    6: "BEGIN; ALTER TABLE idty ADD COLUMN expired INTEGER NULL; COMMIT;",
    7: "BEGIN; ALTER TABLE cert ADD COLUMN expired INTEGER NULL; COMMIT;",
    8: "BEGIN; ALTER TABLE membership ADD COLUMN expired INTEGER NULL; COMMIT;",
    9: async () => {},
    10: async () => {},
    11:
      "BEGIN;" +
      "ALTER TABLE block ADD COLUMN issuersFrame INTEGER NULL;" +
      "ALTER TABLE block ADD COLUMN issuersFrameVar INTEGER NULL;" +
      "ALTER TABLE block ADD COLUMN issuersCount INTEGER NULL;" +
      "COMMIT;",
    12: async () => {
      let blockDAL = new MetaDAL(this.driverCopy, this.getSqliteDB);
      await blockDAL.exec("ALTER TABLE block ADD COLUMN len INTEGER NULL;");
    },
    13: async () => {},
    14:
      "BEGIN; " +
      "CREATE VIEW IF NOT EXISTS sandbox_idty AS SELECT " +
      "I.*, " +
      "I.hash, " +
      "(SELECT COUNT(*) FROM cert C where C.target = I.hash) AS certsCount, " +
      'CAST(SUBSTR(buid, 0, INSTR(buid, "-")) as number) AS ref_block ' +
      "FROM idty as I " +
      "WHERE NOT I.member " +
      "AND I.expired IS NULL " +
      "ORDER BY certsCount DESC, ref_block DESC;" +
      "CREATE VIEW IF NOT EXISTS sandbox_memberships AS SELECT " +
      "* " +
      "FROM membership " +
      "WHERE expired IS NULL " +
      "AND written_number IS NULL " +
      "ORDER BY blockNumber DESC;" +
      "CREATE VIEW IF NOT EXISTS sandbox_certs AS SELECT " +
      "* " +
      "FROM cert " +
      "WHERE expired IS NULL " +
      "AND written_block IS NULL " +
      "ORDER BY block_number DESC;" +
      "COMMIT;",

    15: async () => {
      let idtyDAL = new IdentityDAL(this.driverCopy);
      await idtyDAL.exec("ALTER TABLE idty ADD COLUMN revoked_on INTEGER NULL");
    },

    16: async () => {},
    17: async () => {},
    18: async () => {},

    19:
      "BEGIN;" +
      // Add a `removed` column
      "ALTER TABLE idty ADD COLUMN removed BOOLEAN NULL DEFAULT 0;" +
      "COMMIT;",

    // Feeds the table of wallets with balances
    20: async () => {},

    21: async () => {},

    // Replay the wallet table feeding, because of a potential bug
    22: () => {
      return this.migrations[20]();
    },

    23: async () => {},

    /**
     * Feeds the m_index.chainable_on correctly
     */
    24: async () => {},

    // Wrong transaction storage
    25: async () => {},

    // Drop old table 'txs' (replaced by a file 'txs.db')
    26: async () => {
      await this.exec("BEGIN;" + "DROP TABLE IF EXISTS txs;" + "COMMIT;");
    },

    // Add columns 'issuer' and 'recipient' in transaction table - see issue #1442
    27: async () => {
      const txsDriver = await this.getSqliteDB("txs.db");
      const txsDAL = new MetaDAL(txsDriver, this.getSqliteDB);

      // Drop unused indices
      await txsDAL.exec(
        "BEGIN;" +
          "DROP INDEX IF EXISTS idx_txs_locktime;" +
          "DROP INDEX IF EXISTS idx_txs_version;" +
          "DROP INDEX IF EXISTS idx_txs_currency;" +
          "DROP INDEX IF EXISTS idx_txs_comment;" +
          "DROP INDEX IF EXISTS idx_txs_signatures;" +
          "DROP INDEX IF EXISTS idx_txs_received;" +
          "DROP INDEX IF EXISTS idx_txs_output_base;" +
          "DROP INDEX IF EXISTS idx_txs_output_amount;" +
          "CREATE INDEX IF NOT EXISTS idx_txs_issuers ON txs (issuers);" +
          "CREATE INDEX IF NOT EXISTS idx_txs_recipients ON txs (recipients);" +
          "COMMIT;"
      );

      // Add new columns 'issuer' and 'recipient'
      try {
        await txsDAL.exec(
          "BEGIN;" +
            "ALTER TABLE txs ADD COLUMN issuer VARCHAR(50) NULL;" +
            "ALTER TABLE txs ADD COLUMN recipient VARCHAR(50) NULL;" +
            "UOPDATE txs SET issuer = SUBSTR(issuers, 2, LENGTH(issuers) - 4) WHERE issuer IS NULL AND issuers NOT LIKE '%,%';" +
            "UOPDATE txs SET recipient = SUBSTR(recipients, 2, LENGTH(recipients) - 4) WHERE recipient IS NULL AND recipients NOT LIKE '%,%';" +
            "COMMIT;"
        );
      } catch (err) {
        // Silent: if column already exists
      }
    },
  };

  async init() {
    await this.exec(
      "BEGIN;" +
        "CREATE TABLE IF NOT EXISTS " +
        this.table +
        " (" +
        "id INTEGER NOT NULL," +
        "version INTEGER NOT NULL," +
        "PRIMARY KEY (id)" +
        ");" +
        "COMMIT;"
    );
  }

  private async executeMigration(
    migration: string | ((conf: ConfDTO) => void),
    conf: ConfDTO
  ) {
    try {
      if (typeof migration == "string") {
        // Simple SQL script to pass
        await this.exec(migration);
      } else {
        // JS function to execute
        await migration(conf);
      }
    } catch (e) {
      logger.warn("An error occurred during DB migration, continue.", e);
    }
  }

  async upgradeDatabase(conf: ConfDTO) {
    let version = await this.getVersion();
    while (this.migrations[version]) {
      logger.trace(
        `Upgrade database... (patch ${version}/${
          constants.CURRENT_DB_VERSION - 1
        })`
      );

      await this.executeMigration(this.migrations[version], conf);
      // Version increment
      version++;
      await this.exec("UPDATE meta SET version = " + version);
    }
  }

  getRow() {
    return this.sqlFindOne({ id: 1 });
  }

  async getVersion() {
    try {
      const { version } = await this.getRow();
      return version;
    } catch (e) {
      // Insert zero, as first version
      await this.exec("INSERT INTO " + this.table + " VALUES (1,0);");
      return 0;
    }
  }

  cleanData() {
    // Never clean data of this table
    return Promise.resolve();
  }
}
