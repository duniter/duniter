/**
 * Created by cgeek on 22/08/15.
 */

const co = require('co');
const _ = require('underscore');
const indexer = require('./../../../dup/indexer');
const AbstractSQLite = require('./../AbstractSQLite');

module.exports = CIndexDAL;

function CIndexDAL(driver) {

  "use strict";

  AbstractSQLite.call(this, driver);

  const that = this;

  this.table = 'c_index';
  this.fields = [
    'op',
    'issuer',
    'receiver',
    'created_on',
    'written_on',
    'expires_on',
    'expired_on',
    'chainable_on',
    'from_wid',
    'to_wid'
  ];
  this.arrays = [];
  this.bigintegers = [];
  this.booleans = [];
  this.pkFields = ['op', 'issuer', 'receiver', 'written_on'];
  this.translated = {};

  this.init = () => co(function *() {
    return that.exec('BEGIN;' +
      'CREATE TABLE IF NOT EXISTS ' + that.table + ' (' +
      'op VARCHAR(10) NOT NULL,' +
      'issuer VARCHAR(50) NOT NULL,' +
      'receiver VARCHAR(50) NOT NULL,' +
      'created_on VARCHAR(80) NOT NULL,' +
      'written_on VARCHAR(80) NOT NULL,' +
      'expires_on INTEGER NULL,' +
      'expired_on INTEGER NULL,' +
      'chainable_on INTEGER NULL,' +
      'from_wid INTEGER NULL,' +
      'to_wid INTEGER NULL,' +
      'PRIMARY KEY (op,issuer,receiver,written_on)' +
      ');' +
      'CREATE INDEX IF NOT EXISTS idx_cindex_issuer ON c_index (issuer);' +
      'CREATE INDEX IF NOT EXISTS idx_cindex_receiver ON c_index (receiver);' +
      'CREATE INDEX IF NOT EXISTS idx_cindex_chainable_on ON c_index (chainable_on);' +
      'COMMIT;', []);
  });

  this.reducablesFrom = (from) => co(function*() {
    const reducables = yield that.query('SELECT * FROM ' + that.table + ' WHERE issuer = ? ORDER BY CAST(written_on as integer) ASC', [from]);
    return indexer.DUP_HELPERS.reduceBy(reducables, ['issuer', 'receiver', 'created_on']);
  });

  this.removeBlock = (blockstamp) => that.exec('DELETE FROM ' + that.table + ' WHERE written_on = \'' + blockstamp + '\'');
}
