"use strict";

/**
 * Created by cgeek on 22/08/15.
 */

var co = require('co');
var logger = require('../../logger')('metaDAL');
var Transaction = require('../../entity/transaction');
var AbstractSQLite = require('./AbstractSQLite');

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
    0: 'BEGIN; COMMIT;',
    1: 'BEGIN; COMMIT;',
    2: 'BEGIN; ALTER TABLE txs ADD COLUMN received INTEGER NULL; COMMIT;',
    3: () => co(function*() {
      let txsDAL = new (require('./TxsDAL'))(db);
      let txs = yield txsDAL.sqlListAll();
      Transaction.statics.setRecipients(txs);
      for (let i = 0; i < txs.length; i++) {
        yield txsDAL.saveEntity(txs[i]);
      }
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
