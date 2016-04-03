/**
 * Created by cgeek on 22/08/15.
 */

var co = require('co');
var logger = require('../../../../app/lib/logger')('linksDAL');
var AbstractSQLite = require('./AbstractSQLite');

module.exports = MetaDAL;

function MetaDAL(db) {

  "use strict";

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
    1: 'BEGIN; COMMIT;'
  };

  this.init = () => co(function *() {
    return that.exec('BEGIN;' +
      'CREATE TABLE IF NOT EXISTS ' + that.table + ' (' +
      'id INTEGER NOT NULL,' +
      'version INTEGER NOT NULL,' +
      'PRIMARY KEY (id)' +
      ');' +
      'INSERT INTO ' + that.table + ' VALUES (1,0);' +
      'COMMIT;', []);
  });

  this.upgradeDatabase = () => co(function *() {
    let version = yield that.getVersion();
    while(migrations[version]) {
      yield that.exec(migrations[version]);
      // Automated increment
      yield that.exec('UPDATE meta SET version = version + 1');
      version++;
    }
  });

  this.getRow = () => that.sqlFindOne({ id: 1 });

  this.getVersion = () => co(function *() {
    let row = yield that.getRow();
    return row.version;
  });
}
