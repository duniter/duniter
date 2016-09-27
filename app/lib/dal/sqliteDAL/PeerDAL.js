/**
 * Created by cgeek on 22/08/15.
 */

const co = require('co');
const AbstractSQLite = require('./AbstractSQLite');

module.exports = PeerDAL;

function PeerDAL(driver) {

  "use strict";

  AbstractSQLite.call(this, driver);

  const that = this;

  this.table = 'peer';
  this.fields = [
    'version',
    'currency',
    'status',
    'statusTS',
    'hash',
    'first_down',
    'last_try',
    'pubkey',
    'block',
    'signature',
    'endpoints',
    'raw'
  ];
  this.arrays = ['endpoints'];
  this.booleans = [];
  this.pkFields = ['pubkey'];
  this.translated = {};

  this.init = () => co(function *() {
    return that.exec('BEGIN;' +
      'CREATE TABLE IF NOT EXISTS ' + that.table + ' (' +
      'version INTEGER NOT NULL,' +
      'currency VARCHAR(50) NOT NULL,' +
      'status VARCHAR(10),' +
      'statusTS INTEGER NOT NULL,' +
      'hash CHAR(64),' +
      'first_down INTEGER,' +
      'last_try INTEGER,' +
      'pubkey VARCHAR(50) NOT NULL,' +
      'block VARCHAR(60) NOT NULL,' +
      'signature VARCHAR(100),' +
      'endpoints TEXT NOT NULL,' +
      'raw TEXT,' +
      'PRIMARY KEY (pubkey)' +
      ');' +
      'CREATE INDEX IF NOT EXISTS idx_link_source ON peer (pubkey);' +
      'COMMIT;', []);
  });

  this.listAll = () => this.sqlListAll();

  this.getPeer = (pubkey) => this.sqlFindOne({ pubkey: pubkey });

  this.savePeer = (peer) => this.saveEntity(peer);

  this.removeAll = () => this.sqlDeleteAll();
}
