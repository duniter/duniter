/**
 * Created by cgeek on 22/08/15.
 */

const co = require('co');
const AbstractSQLite = require('./../AbstractSQLite');

module.exports = BIndexDAL;

function BIndexDAL(driver) {

  "use strict";

  AbstractSQLite.call(this, driver);

  const that = this;

  this.table = 'b_index';
  this.fields = [
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
    'unitBase',
    'powMin',
    'udTime',
    'diffNumber',
    'speed'
  ];
  this.arrays = [];
  this.bigintegers = ['mass'];
  this.booleans = ['leaving'];
  this.pkFields = ['number'];
  this.translated = {};

  this.init = () => co(function *() {
    return that.exec('BEGIN;' +
      'CREATE TABLE IF NOT EXISTS ' + that.table + ' (' +
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
      'diffNumber INTEGER NOT NULL,' +
      'speed FLOAT NOT NULL,' +
      'PRIMARY KEY (number)' +
      ');' +
      'CREATE INDEX IF NOT EXISTS idx_bindex_number ON b_index (number);' +
      'CREATE INDEX IF NOT EXISTS idx_bindex_issuer ON b_index (issuer);' +
      'COMMIT;', []);
  });

  /**
   * Get HEAD~n
   * @param n Position
   */
  this.head = (n) => co(function*() {
    // Default to HEAD~1
    n = n || 1;
    const headRecords = yield that.query('SELECT * FROM ' + that.table + ' ORDER BY number DESC LIMIT 1 OFFSET ?', [n - 1]);
    return headRecords[0];
  });

  /**
   * Get the last record available in bindex
   */
  this.tail = () => co(function*() {
    const tailRecords = yield that.query('SELECT * FROM ' + that.table + ' ORDER BY number ASC LIMIT 1', []);
    return tailRecords[0];
  });

  /**
   * Get HEAD~n..m
   * @param n
   * @param m
   */
  this.range = (n, m) => co(function*() {
    const count = m - n + 1;
    return that.query('SELECT * FROM ' + that.table + ' ORDER BY number DESC LIMIT ? OFFSET ?', [count, n - 1]);
  });

  this.removeBlock = (number) => that.exec('DELETE FROM ' + that.table + ' WHERE number = ' + number);

  this.trimBlocks = (maxnumber) => that.exec('DELETE FROM ' + that.table + ' WHERE number < ' + maxnumber);
}
