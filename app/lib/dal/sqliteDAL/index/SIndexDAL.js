/**
 * Created by cgeek on 22/08/15.
 */

const co = require('co');
const _ = require('underscore');
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
    'written_on',
    'amount',
    'base',
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
      'written_on VARCHAR(80) NOT NULL,' +
      'amount VARCHAR(50) NULL,' +
      'base INTEGER NULL,' +
      'consumed BOOLEAN NOT NULL,' +
      'conditions TEXT,' +
      'PRIMARY KEY (op,identifier,pos,written_on)' +
      ');' +
      'CREATE INDEX IF NOT EXISTS idx_sindex_identifier ON s_index (identifier);' +
      'CREATE INDEX IF NOT EXISTS idx_sindex_pos ON s_index (pos);' +
      'COMMIT;', []);
  });

  this.removeBlock = (blockstamp) => that.exec('DELETE FROM ' + that.table + ' WHERE written_on = \'' + blockstamp + '\'');
}
