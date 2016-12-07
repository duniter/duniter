/**
 * Created by cgeek on 22/08/15.
 */

const co = require('co');
const _ = require('underscore');
const AbstractSQLite = require('./../AbstractSQLite');

module.exports = IIndexDAL;

function IIndexDAL(driver) {

  "use strict";

  AbstractSQLite.call(this, driver);

  const that = this;

  this.table = 'i_index';
  this.fields = [
    'op',
    'uid',
    'pub',
    'created_on',
    'written_on',
    'member',
    'wasMember',
    'kick',
    'wid'
  ];
  this.arrays = [];
  this.bigintegers = [];
  this.booleans = ['member', 'wasMember', 'kick'];
  this.pkFields = ['op', 'pub', 'written_on'];
  this.translated = {};

  this.init = () => co(function *() {
    return that.exec('BEGIN;' +
      'CREATE TABLE IF NOT EXISTS ' + that.table + ' (' +
      'op VARCHAR(10) NOT NULL,' +
      'uid VARCHAR(100) NULL,' +
      'pub VARCHAR(50) NOT NULL,' +
      'created_on VARCHAR(80) NOT NULL,' +
      'written_on VARCHAR(80) NOT NULL,' +
      'member BOOLEAN NULL,' +
      'wasMember BOOLEAN NULL,' +
      'kick BOOLEAN NULL,' +
      'wid INTEGER NULL,' +
      'PRIMARY KEY (op,pub,written_on)' +
      ');' +
      'CREATE INDEX IF NOT EXISTS idx_iindex_pub ON i_index (pub);' +
      'COMMIT;', []);
  });
}
