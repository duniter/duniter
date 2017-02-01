/**
 * Created by cgeek on 22/08/15.
 */

const _ = require('underscore');
const co = require('co');
const indexer = require('../../../dup/indexer');
const constants = require('../../../constants');
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
  this.bigintegers = [];
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
      'amount INTEGER NULL,' +
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
    const reducable = yield that.query('SELECT * FROM ' + that.table + ' s1 ' +
      'WHERE s1.identifier = ? ' +
      'AND s1.pos = ? ' +
      'ORDER BY op ASC', [identifier, pos]);
    if (reducable.length == 0) {
      return null;
    } else {
      const src = indexer.DUP_HELPERS.reduce(reducable);
      src.type = src.tx ? 'T' : 'D';
      return src;
    }
  });

  this.getUDSources = (pubkey) => co(function*() {
    const reducables = yield that.query('SELECT * FROM ' + that.table + ' s1 ' +
      'WHERE conditions = ? ' +
      'AND s1.tx IS NULL ' +
      'ORDER BY op ASC', ['SIG(' + pubkey + ')']);
    const reduced = indexer.DUP_HELPERS.reduceBy(reducables, ['identifier', 'pos']).map((src) => {
      src.type = src.tx ? 'T' : 'D';
      return src;
    });
    return _.sortBy(reduced, (row) => row.type == 'D' ? 0 : 1);
  });

  this.getAvailableForPubkey = (pubkey) => this.getAvailableForConditions('%SIG(' + pubkey + ')%');

  this.getAvailableForConditions = (conditionsStr) => co(function*() {
    const potentials = yield that.query('SELECT * FROM ' + that.table + ' s1 ' +
      'WHERE s1.op = ? ' +
      'AND conditions LIKE ? ' +
      'AND NOT EXISTS (' +
      ' SELECT * ' +
      ' FROM s_index s2 ' +
      ' WHERE s2.identifier = s1.identifier ' +
      ' AND s2.pos = s1.pos ' +
      ' AND s2.op = ?' +
      ') ' +
      'ORDER BY CAST(SUBSTR(written_on, 0, INSTR(written_on, "-")) as number)', [constants.IDX_CREATE, conditionsStr, constants.IDX_UPDATE]);
    const sources = potentials.map((src) => {
      src.type = src.tx ? 'T' : 'D';
      return src;
    });
    return _.sortBy(sources, (row) => row.type == 'D' ? 0 : 1);
  });

  this.findLowerThan = (amount, base) => co(function*() {
    const baseConditions = Array.from({ length: (base + 1) }).map((el, index) => {
      return '(base = ' + index + ' and amount < ' + (amount * Math.pow(10, base - index)) + ')';
    }).join(' OR ');
    const potentials = yield that.query('SELECT * FROM ' + that.table + ' s1 ' +
      'WHERE s1.op = ? ' +
      'AND (' + baseConditions + ') ' +
      'AND NOT EXISTS (' +
      ' SELECT * ' +
      ' FROM s_index s2 ' +
      ' WHERE s2.identifier = s1.identifier ' +
      ' AND s2.pos = s1.pos ' +
      ' AND s2.op = ?' +
      ')', [constants.IDX_CREATE, constants.IDX_UPDATE]);
    return potentials;
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
