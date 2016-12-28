/**
 * Created by cgeek on 22/08/15.
 */

const co = require('co');
const constants = require('./../../../constants');
const indexer = require('./../../../dup/indexer');
const AbstractSQLite = require('./../AbstractSQLite');
const AbstractIndex = require('./../AbstractIndex');

module.exports = CIndexDAL;

function CIndexDAL(driver) {

  "use strict";

  AbstractSQLite.call(this, driver);
  AbstractIndex.call(this, driver);

  const that = this;

  this.table = 'c_index';
  this.fields = [
    'op',
    'issuer',
    'receiver',
    'created_on',
    'written_on',
    'sig',
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
      'sig VARCHAR(100) NULL,' +
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

  this.trimExpiredCerts = (belowNumber) => co(function*() {
    const toDelete = yield that.query('SELECT * FROM ' + that.table + ' WHERE expired_on > ? AND CAST(written_on as int) < ?', [0, belowNumber]);
    for (const row of toDelete) {
      yield that.exec("DELETE FROM " + that.table + " " +
        "WHERE issuer like '" + row.issuer + "' " +
        "AND receiver = '" + row.receiver + "' " +
        "AND created_on like '" + row.created_on + "'");
    }
  });

  this.getWrittenOn = (blockstamp) => that.sqlFind({ written_on: blockstamp });

  this.findExpired = (medianTime) => that.query('SELECT * FROM ' + that.table + ' c1 WHERE expires_on <= ? ' +
    'AND NOT EXISTS (' +
    ' SELECT * FROM c_index c2' +
    ' WHERE c1.issuer = c2.issuer' +
    ' AND c1.receiver = c2.receiver' +
    ' AND c1.created_on = c2.created_on' +
    ' AND c2.op = ?' +
    ')', [medianTime, constants.IDX_UPDATE]);

  this.getValidLinksTo = (receiver) => that.query('SELECT * FROM ' + that.table + ' c1 ' +
    'WHERE c1.receiver = ? ' +
    'AND NOT EXISTS (' +
    ' SELECT * FROM c_index c2' +
    ' WHERE c1.issuer = c2.issuer' +
    ' AND c1.receiver = c2.receiver' +
    ' AND c1.created_on = c2.created_on' +
    ' AND c2.op = ?' +
    ')', [receiver, constants.IDX_UPDATE]);

  this.getValidLinksFrom = (issuer) => that.query('SELECT * FROM ' + that.table + ' c1 ' +
    'WHERE c1.issuer = ? ' +
    'AND NOT EXISTS (' +
    ' SELECT * FROM c_index c2' +
    ' WHERE c1.issuer = c2.issuer' +
    ' AND c1.receiver = c2.receiver' +
    ' AND c1.created_on = c2.created_on' +
    ' AND c2.op = ?' +
    ')', [issuer, constants.IDX_UPDATE]);

  this.existsNonReplayableLink = (issuer, receiver) => co(function*() {
    const results = that.query('SELECT * FROM ' + that.table + ' c1 ' +
      'WHERE c1.issuer = ? ' +
      'AND c1.receiver = ? ' +
      'AND NOT EXISTS (' +
      ' SELECT * FROM c_index c2' +
      ' WHERE c1.issuer = c2.issuer' +
      ' AND c1.receiver = c2.receiver' +
      ' AND c1.created_on = c2.created_on' +
      ' AND c2.op = ?' +
      ')', [issuer, receiver, constants.IDX_UPDATE]);
    return results.length > 0;
  });

  this.removeBlock = (blockstamp) => that.exec('DELETE FROM ' + that.table + ' WHERE written_on = \'' + blockstamp + '\'');
}
