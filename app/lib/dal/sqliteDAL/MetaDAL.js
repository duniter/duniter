"use strict";

/**
 * Created by cgeek on 22/08/15.
 */

const co = require('co');
const _ = require('underscore');
const logger = require('../../logger')('metaDAL');
const Block = require('../../entity/block');
const Revocation = require('../../entity/revocation');
const Transaction = require('../../entity/transaction');
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
      const txsDAL = new (require('./TxsDAL'))(driver);
      const txs = yield txsDAL.sqlListAll();
      Transaction.statics.setRecipients(txs);
      for (const tx of txs) {
        yield txsDAL.saveEntity(tx);
      }
    }),

    // Migrates wrong unitbases
    4: () => co(function*() {
      let blockDAL = new (require('./BlockDAL'))(driver);
      let dividendBlocks = yield blockDAL.getDividendBlocks();
      let bases = { 0: 0 }; // The first base is always 0 at block 0
      for (let i = 0; i < dividendBlocks.length; i++) {
        let block = dividendBlocks[i];
        if (!bases[block.unitbase]) {
          bases[block.unitbase] = block.number;
        } else {
          bases[block.unitbase] = Math.min(bases[block.unitbase], block.number);
        }
      }
      let baseNumbers = _.keys(bases);
      for (let i = 0; i < baseNumbers.length; i++) {
        let base = parseInt(baseNumbers[i]);
        let fromBlock = bases[base];
        let upTo = bases[base + 1] || null;
        if (upTo != null) {
          yield blockDAL.exec('UPDATE block SET unitbase = ' + base + ' WHERE number >= ' + fromBlock + ' AND number < ' + upTo);
        } else {
          // The last base has not a successor yet, so we can take all following blocks
          yield blockDAL.exec('UPDATE block SET unitbase = ' + base + ' WHERE number >= ' + fromBlock);
        }
      }
    }),

    // Migrates wrong monetary masses
    5: () => co(function*() {
      let blockDAL = new (require('./BlockDAL'))(driver);
      let udBlocks = yield blockDAL.getDividendBlocks();
      let monetaryMass = 0;
      let lastUDBlock = 0;
      for (let i = 0; i < udBlocks.length; i++) {
        let udBlock = udBlocks[i];
        if (i == 0) {
          // First UD
          yield blockDAL.exec('UPDATE block SET monetaryMass = 0 WHERE number < ' + udBlock.number);
        } else {
          // Other UDs
          let prevUDBlock = udBlocks[i - 1];
          let fromBlock = prevUDBlock.number;
          let upToExcluded = udBlock.number;
          yield blockDAL.exec('UPDATE block SET monetaryMass = ' + monetaryMass + ' WHERE number >= ' + fromBlock + ' AND number < ' + upToExcluded);
        }
        lastUDBlock = udBlock.number;
        monetaryMass += udBlock.dividend * Math.pow(10, udBlock.unitbase) * udBlock.membersCount;
      }
      // Blocks since last UD have the same monetary mass as last UD block
      yield blockDAL.exec('UPDATE block SET monetaryMass = ' + monetaryMass + ' WHERE number >= ' + lastUDBlock);
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
      const current = yield blockDAL.getCurrent();
      if (current && current.version == 2) {
        const blocks = yield blockDAL.getBlocks(Math.max(0, current.number - 99), current.number);
        for (const block of blocks) {
          block.len = Block.statics.getLen(block);
          blockDAL.saveBlock(block);
        }
      }
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
      let blockDAL = new (require('./BlockDAL'))(driver);
      let idtyDAL = new (require('./IdentityDAL'))(driver);
      yield idtyDAL.exec('ALTER TABLE idty ADD COLUMN revoked_on INTEGER NULL');
      const blocks = yield blockDAL.query('SELECT * FROM block WHERE revoked NOT LIKE ?', ['[]']);
      for (const block of blocks) {
        // Explicit revocations only
        for (const inlineRevocation of block.revoked) {
          const revocation = Revocation.statics.fromInline(inlineRevocation);
          const idty = yield idtyDAL.getFromPubkey(revocation.pubkey);
          idty.revoked_on = block.number;
          yield idtyDAL.saveIdentity(idty);
        }
      }
    }),
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
