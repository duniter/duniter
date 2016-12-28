/**
 * Created by cgeek on 22/08/15.
 */

const co = require('co');
const _ = require('underscore');
const indexer = require('./../../../dup/indexer');
const AbstractSQLite = require('./../AbstractSQLite');
const AbstractIndex = require('./../AbstractIndex');

module.exports = IIndexDAL;

function IIndexDAL(driver) {

  "use strict";

  AbstractSQLite.call(this, driver);
  AbstractIndex.call(this);

  const that = this;

  this.table = 'i_index';
  this.fields = [
    'op',
    'uid',
    'pub',
    'hash',
    'sig',
    'created_on',
    'written_on',
    'member',
    'wasMember',
    'kick',
    'wotb_id'
  ];
  this.arrays = [];
  this.bigintegers = [];
  this.booleans = ['member', 'wasMember', 'kick'];
  this.pkFields = ['op', 'pub', 'created_on', 'written_on'];
  this.translated = {};

  this.init = () => co(function *() {
    return that.exec('BEGIN;' +
      'CREATE TABLE IF NOT EXISTS ' + that.table + ' (' +
      'op VARCHAR(10) NOT NULL,' +
      'uid VARCHAR(100) NULL,' +
      'pub VARCHAR(50) NOT NULL,' +
      'hash VARCHAR(80) NULL,' +
      'sig VARCHAR(80) NULL,' +
      'created_on VARCHAR(80) NULL,' +
      'written_on VARCHAR(80) NOT NULL,' +
      'member BOOLEAN NULL,' +
      'wasMember BOOLEAN NULL,' +
      'kick BOOLEAN NULL,' +
      'wotb_id INTEGER NULL,' +
      'PRIMARY KEY (op,pub,created_on,written_on)' +
      ');' +
      'CREATE INDEX IF NOT EXISTS idx_iindex_pub ON i_index (pub);' +
      'COMMIT;', []);
  });

  this.getMembers = () => co(function*() {
    // All those who has been subject to, or who are currently subject to kicking. Make one result per pubkey.
    const pubkeys = yield that.query('SELECT DISTINCT(pub) FROM ' + that.table);
    // We get the full representation for each member
    const reduced = yield pubkeys.map((entry) => co(function*() {
      const reducable = yield that.reducable(entry.pub);
      return indexer.DUP_HELPERS.reduce(reducable);
    }));
    // Filter on those to be kicked, return their pubkey
    const filtered = _.filter(reduced, (entry) => entry.member);
    return filtered.map(toCorrectEntity);
  });

  this.getLatestMember = () => co(function*() {
    const max_wotb_id = (yield that.query('SELECT MAX(wotb_id) as max_wotb_id FROM ' + that.table))[0].max_wotb_id;
    return entityOrNull('wotb_id', max_wotb_id);
  });

  this.getToBeKickedPubkeys = () => co(function*() {
    // All those who has been subject to, or who are currently subject to kicking. Make one result per pubkey.
    const reducables = indexer.DUP_HELPERS.reduceBy(yield that.sqlFind({ kick: true }), ['pub']);
    // We get the full representation for each member
    const reduced = yield reducables.map((entry) => co(function*() {
      const reducable = yield that.reducable(entry.pub);
      return indexer.DUP_HELPERS.reduce(reducable);
    }));
    // Filter on those to be kicked, return their pubkey
    return _.filter(reduced, (entry) => entry.kick).map((entry) => entry.pub);
  });

  this.searchThoseMatching = (search) => co(function*() {
    const reducables = indexer.DUP_HELPERS.reduceBy(yield that.sqlFindLikeAny({
        pub: "%" + search + "%",
        uid: "%" + search + "%"
      }), ['pub']);
    // We get the full representation for each member
    return yield reducables.map((entry) => co(function*() {
      return toCorrectEntity(indexer.DUP_HELPERS.reduce(yield that.reducable(entry.pub)));
    }));
  });

  this.getFromPubkey = (pubkey) => entityOrNull('pub', pubkey);

  this.getFromUID = (uid) => entityOrNull('uid', uid);

  this.getFromHash = (hash) => entityOrNull('hash', hash, 'pub');

  this.reducable = (pub) => this.query('SELECT * FROM ' + this.table + ' WHERE pub = ? ORDER BY CAST(written_on as integer) ASC', [pub]);

  this.removeBlock = (blockstamp) => that.exec('DELETE FROM ' + that.table + ' WHERE written_on = \'' + blockstamp + '\'');

  function entityOrNull(field, value, retrieveOnField) {
    return co(function*() {
      let reducable = yield that.query('SELECT * FROM ' + that.table + ' WHERE ' + field + ' = ?', [value]);
      if (reducable.length) {
        if (retrieveOnField) {
          // Force full retrieval on `pub` field
          reducable = yield that.query('SELECT * FROM ' + that.table + ' WHERE pub = ? ORDER BY CAST(written_on as int) ASC', [reducable[0].pub]);
        }
        return toCorrectEntity(indexer.DUP_HELPERS.reduce(reducable));
      }
      return null;
    });
  }

  function toCorrectEntity(row) {
    // Old field
    row.pubkey = row.pub;
    row.buid = row.created_on;
    row.revocation_sig = null;
    return row;
  }
}
