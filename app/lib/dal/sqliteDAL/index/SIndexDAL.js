/**
 * Created by cgeek on 22/08/15.
 */

const _ = require('underscore');
const co = require('co');
const indexer = require('../../../dup/indexer');
const AbstractSQLite = require('./../AbstractSQLite');

module.exports = SIndexDAL;

function SIndexDAL(driver) {

  "use strict";

  AbstractSQLite.call(this, driver);

  const that = this;

  this.table = 's_index';
  this.fields = [
    'op',
    'tx',
    'identifier',
    'pos',
    'created_on',
    'written_on',
    'written_time',
    'amount',
    'base',
    'locktime',
    'consumed',
    'conditions'
  ];
  this.arrays = [];
  this.bigintegers = ['amount'];
  this.booleans = ['consumed'];
  this.pkFields = ['op', 'identifier', 'pos', 'written_on'];
  this.translated = {};

  this.init = () => co(function *() {
    return that.exec('BEGIN;' +
      'CREATE TABLE IF NOT EXISTS ' + that.table + ' (' +
      'op VARCHAR(10) NOT NULL,' +
      'tx VARCHAR(80) NULL,' +
      'identifier VARCHAR(64) NOT NULL,' +
      'pos INTEGER NOT NULL,' +
      'created_on VARCHAR(80) NULL,' +
      'written_on VARCHAR(80) NOT NULL,' +
      'written_time INTEGER NOT NULL,' +
      'amount VARCHAR(50) NULL,' +
      'base INTEGER NULL,' +
      'locktime INTEGER NULL,' +
      'consumed BOOLEAN NOT NULL,' +
      'conditions TEXT,' +
      'PRIMARY KEY (op,identifier,pos,written_on)' +
      ');' +
      'CREATE INDEX IF NOT EXISTS idx_sindex_identifier ON s_index (identifier);' +
      'CREATE INDEX IF NOT EXISTS idx_sindex_pos ON s_index (pos);' +
      'COMMIT;', []);
  });

  this.removeBlock = (blockstamp) => that.exec('DELETE FROM ' + that.table + ' WHERE written_on = \'' + blockstamp + '\'');

  this.getSource = (identifier, pos) => co(function*() {
    const reducable = yield that.sqlFind({ identifier, pos });
    if (reducable.length == 0) {
      return null;
    } else {
      const src = indexer.DUP_HELPERS.reduce(reducable);
      src.type = src.tx ? 'T' : 'D';
      return src;
    }
  });

  this.getUDSources = (pubkey) => co(function*() {
    const reducables = yield that.sqlFind({
      conditions: { $contains: pubkey },
      tx: { $null: true }
    });
    const reduced = indexer.DUP_HELPERS.reduceBy(reducables, ['identifier', 'pos']).map((src) => {
      src.type = src.tx ? 'T' : 'D';
      return src;
    });
    return _.sortBy(reduced, (row) => row.type == 'D' ? 0 : 1);
  });

  this.getAvailableForPubkey = (pubkey) => co(function*() {
    const reducables = yield that.sqlFind({
      conditions: { $contains: 'SIG(' + pubkey + ')' }
    });
    const sources = indexer.DUP_HELPERS.reduceBy(reducables, ['identifier', 'pos']).map((src) => {
      src.type = src.tx ? 'T' : 'D';
      return src;
    });
    const filtered = _.filter(sources, (src) => !src.consumed);
    return _.sortBy(filtered, (row) => row.type == 'D' ? 0 : 1);
  });

  this.trimConsumedSource = (belowNumber) => co(function*() {
    const toDelete = yield that.query('SELECT * FROM ' + that.table + ' WHERE consumed AND CAST(written_on as int) < ?', [belowNumber]);
    const queries = [];
    for (const row of toDelete) {
      const sql = "DELETE FROM " + that.table + " " +
        "WHERE identifier like '" + row.identifier + "' " +
        "AND pos = " + row.pos;
      queries.push(sql);
    }
    yield that.exec(queries.join(';\n'));
  });
}
