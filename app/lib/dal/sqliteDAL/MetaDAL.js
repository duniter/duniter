"use strict";

/**
 * Created by cgeek on 22/08/15.
 */

const co = require('co');
const _ = require('underscore');
const logger = require('../../logger')('metaDAL');
const AbstractSQLite = require('./AbstractSQLite');

module.exports = MetaDAL;

function MetaDAL(driver) {

  AbstractSQLite.call(this, driver);

  const that = this;

  this.table = 'meta';
  this.fields = [
    'id',
    'version'
  ];
  this.arrays = [];
  this.booleans = [];
  this.pkFields = ['version'];
  this.translated = {};

  const migrations = {

    // Test
    0: 'BEGIN; COMMIT;',

    // Test
    1: 'BEGIN; COMMIT;',

    // New `receveid` column
    2: 'BEGIN; ALTER TABLE txs ADD COLUMN received INTEGER NULL; COMMIT;',

    // Update wrong recipients field (was not filled in)
    3: () => co(function*() {
    }),

    // Migrates wrong unitbases
    4: () => co(function*() {
    }),

    // Migrates wrong monetary masses
    5: () => co(function*() {
    }),

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
    12: () => co(function *() {
      let blockDAL = new (require('./BlockDAL'))(driver);
      yield blockDAL.exec('ALTER TABLE block ADD COLUMN len INTEGER NULL;');
      yield blockDAL.exec('ALTER TABLE txs ADD COLUMN len INTEGER NULL;');
    }),
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

    15: () => co(function *() {
      let idtyDAL = new (require('./IdentityDAL'))(driver);
      yield idtyDAL.exec('ALTER TABLE idty ADD COLUMN revoked_on INTEGER NULL');
    }),

    16: () => co(function *() {
    })
  };

  this.init = () => co(function *() {
    return that.exec('BEGIN;' +
      'CREATE TABLE IF NOT EXISTS ' + that.table + ' (' +
      'id INTEGER NOT NULL,' +
      'version INTEGER NOT NULL,' +
      'PRIMARY KEY (id)' +
      ');' +
      'COMMIT;', []);
  });

  function executeMigration(migration) {
    return co(function *() {
      try {
        if (typeof migration == "string") {

          // Simple SQL script to pass
          yield that.exec(migration);

        } else if (typeof migration == "function") {

          // JS function to execute
          yield migration();

        }
      } catch (e) {
        logger.warn('An error occured during DB migration, continue.', e);
      }
    });
  }

  this.upgradeDatabase = () => co(function *() {
    let version = yield that.getVersion();
    while(migrations[version]) {
      yield executeMigration(migrations[version]);
      // Automated increment
      yield that.exec('UPDATE meta SET version = version + 1');
      version++;
    }
  });

  this.upgradeDatabaseVersions = (versions) => co(function *() {
    for (const version of versions) {
      logger.debug("Upgrading from to v%s...", version, version + 1);
      yield executeMigration(migrations[version]);
    }
  });

  this.getRow = () => that.sqlFindOne({ id: 1 });

  this.getVersion = () => co(function *() {
    try {
      const row = yield that.getRow();
      return row.version;
    } catch(e) {
      yield that.exec('INSERT INTO ' + that.table + ' VALUES (1,0);');
      return 0;
    }
  });

  this.cleanData = null; // Never clean data of this table
}
