/**
 * Created by cgeek on 22/08/15.
 */

const co = require('co');
const indexer = require('./../../../dup/indexer');
const AbstractSQLite = require('./../AbstractSQLite');
const AbstractIndex = require('./../AbstractIndex');

module.exports = MIndexDAL;

function MIndexDAL(driver) {

  "use strict";

  AbstractSQLite.call(this, driver);
  AbstractIndex.call(this);

  const that = this;

  this.table = 'm_index';
  this.fields = [
    'op',
    'pub',
    'created_on',
    'written_on',
    'expires_on',
    'expired_on',
    'revokes_on',
    'revoked_on',
    'leaving',
    'revocation'
  ];
  this.arrays = [];
  this.bigintegers = [];
  this.booleans = ['leaving'];
  this.pkFields = ['op', 'pub', 'created_on', 'written_on'];
  this.translated = {};

  this.init = () => co(function *() {
    return that.exec('BEGIN;' +
      'CREATE TABLE IF NOT EXISTS ' + that.table + ' (' +
      'op VARCHAR(10) NOT NULL,' +
      'pub VARCHAR(50) NOT NULL,' +
      'created_on VARCHAR(80) NOT NULL,' +
      'written_on VARCHAR(80) NOT NULL,' +
      'expires_on INTEGER NULL,' +
      'expired_on INTEGER NULL,' +
      'revokes_on INTEGER NULL,' +
      'revoked_on INTEGER NULL,' +
      'leaving BOOLEAN NULL,' +
      'revocation VARCHAR(80) NULL,' +
      'PRIMARY KEY (op,pub,created_on,written_on)' +
      ');' +
      'CREATE INDEX IF NOT EXISTS idx_mindex_pub ON m_index (pub);' +
      'COMMIT;', []);
  });

  this.getReducedMS = (pub) => co(function*() {
    const reducables = yield that.reducable(pub);
    if (reducables.length) {
      return indexer.DUP_HELPERS.reduce(reducables);
    }
    return null;
  });

  this.reducable = (pub) => this.query('SELECT * FROM ' + this.table + ' WHERE pub = ? ORDER BY CAST(written_on as integer) ASC', [pub]);

  this.removeBlock = (blockstamp) => that.exec('DELETE FROM ' + that.table + ' WHERE written_on = \'' + blockstamp + '\'');
}
