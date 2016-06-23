"use strict";

/**
 * Created by cgeek on 22/08/15.
 */

const co = require('co');
const _ = require('underscore');
const logger = require('../../logger')('metaDAL');
const Transaction = require('../../entity/transaction');
const AbstractSQLite = require('./AbstractSQLite');

module.exports = MetaDAL;

function MetaDAL(db) {

  AbstractSQLite.call(this, db);

  let that = this;

  this.table = 'meta';
  this.fields = [
    'id',
    'version'
  ];
  this.arrays = [];
  this.booleans = [];
  this.pkFields = ['version'];
  this.translated = {};

  let migrations = {

    // Test
    0: 'BEGIN; COMMIT;',

    // Test
    1: 'BEGIN; COMMIT;',

    // New `receveid` column
    2: 'BEGIN; ALTER TABLE txs ADD COLUMN received INTEGER NULL; COMMIT;',

    // Update wrong recipients field (was not filled in)
    3: () => co(function*() {
      let txsDAL = new (require('./TxsDAL'))(db);
      let txs = yield txsDAL.sqlListAll();
      Transaction.statics.setRecipients(txs);
      for (let i = 0; i < txs.length; i++) {
        yield txsDAL.saveEntity(txs[i]);
      }
    }),

    // Migrates wrong unitbases
    4: () => co(function*() {
      let blockDAL = new (require('./BlockDAL'))(db);
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
      let blockDAL = new (require('./BlockDAL'))(db);
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

  this.upgradeDatabase = () => co(function *() {
    let version = yield that.getVersion();
    while(migrations[version]) {
      logger.debug("Upgrading from v%s to v%s...", version, version + 1);

      if (typeof migrations[version] == "string") {

        // Simple SQL script to pass
        yield that.exec(migrations[version]);

      } else if (typeof migrations[version] == "function") {

        // JS function to execute
        yield migrations[version]();
        
      }
      // Automated increment
      yield that.exec('UPDATE meta SET version = version + 1');
      version++;
    }
  });

  this.getRow = () => that.sqlFindOne({ id: 1 });

  this.getVersion = () => co(function *() {
    try {
      let row = yield that.getRow();
      return row.version;
    } catch(e) {
      yield that.exec('INSERT INTO ' + that.table + ' VALUES (1,0);');
      return 0;
    }
  });

  this.cleanData = null; // Never clean data of this table
}
