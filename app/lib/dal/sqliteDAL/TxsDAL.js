/**
 * Created by cgeek on 22/08/15.
 */

const Q = require('q');
const co = require('co');
const moment = require('moment');
const Transaction = require('../../entity/transaction');
const AbstractSQLite = require('./AbstractSQLite');

module.exports = TxsDAL;

function TxsDAL(db) {

  "use strict";

  AbstractSQLite.call(this, db);

  const that = this;

  this.table = 'txs';
  this.fields = [
    'hash',
    'block_number',
    'version',
    'currency',
    'comment',
    'locktime',
    'received',
    'time',
    'written',
    'removed',
    'inputs',
    'unlocks',
    'outputs',
    'issuers',
    'signatories',
    'signatures',
    'recipients'
  ];
  this.arrays = ['inputs','unlocks','outputs','issuers','signatories','signatures','recipients'];
  this.booleans = ['written','removed'];
  this.pkFields = ['hash'];
  this.translated = {};

  this.init = () => co(function *() {
    return that.exec('BEGIN;' +
      'CREATE TABLE IF NOT EXISTS ' + that.table + ' (' +
      'hash CHAR(64) NOT NULL,' +
      'block_number INTEGER,' +
      'locktime INTEGER NOT NULL,' +
      'version INTEGER NOT NULL,' +
      'currency VARCHAR(50) NOT NULL,' +
      'comment VARCHAR(255) NOT NULL,' +
      'time DATETIME,' +
      'inputs TEXT NOT NULL,' +
      'unlocks TEXT NOT NULL,' +
      'outputs TEXT NOT NULL,' +
      'issuers TEXT NOT NULL,' +
      'signatories TEXT NOT NULL,' +
      'signatures TEXT NOT NULL,' +
      'recipients TEXT NOT NULL,' +
      'written BOOLEAN NOT NULL,' +
      'removed BOOLEAN NOT NULL,' +
      'PRIMARY KEY (hash)' +
      ');' +
      'CREATE INDEX IF NOT EXISTS idx_txs_issuers ON txs (issuers);' +
      'CREATE INDEX IF NOT EXISTS idx_txs_written ON txs (written);' +
      'CREATE INDEX IF NOT EXISTS idx_txs_removed ON txs (removed);' +
      'CREATE INDEX IF NOT EXISTS idx_txs_hash ON txs (hash);' +
      'COMMIT;', []);
  });

  this.getAllPending = () => this.sqlFind({
    written: false,
    removed: false
  });

  this.getTX = (hash) => this.sqlFindOne({
    hash: hash
  });

  this.removeTX = (hash) => co(function *() {
    const tx = yield that.sqlFindOne({
      hash: hash
    });
    if (tx) {
      tx.removed = true;
      return that.saveEntity(tx);
    }
    return Q(tx);
  });

  this.addLinked = (tx) => {
    tx.written = true;
    tx.removed = false;
    tx.hash = tx.getHash(true);
    tx.recipients = Transaction.statics.outputs2recipients(tx);
    return that.saveEntity(tx);
  };

  this.addPending = (tx) => {
    tx.received = moment().unix();
    tx.written = false;
    tx.removed = false;
    tx.hash = tx.getHash(true);
    tx.recipients = Transaction.statics.outputs2recipients(tx);
    return this.saveEntity(tx);
  };

  this.getLinkedWithIssuer = (pubkey) => this.sqlFind({
    issuers: { $contains: pubkey },
    written: true
  });

  this.getLinkedWithRecipient = (pubkey) => this.sqlFind({
    recipients: { $contains: pubkey },
    written: true
  });

  this.getPendingWithIssuer = (pubkey) => this.sqlFind({
    issuers: { $contains: pubkey },
    written: false
  });

  this.getPendingWithRecipient = (pubkey) => this.sqlFind({
    recipients: { $contains: pubkey },
    written: false
  });

  this.insertBatchOfTxs = (txs) => co(function *() {
    // // Be sure the recipients field are correctly updated
    Transaction.statics.setRecipients(txs);
    const queries = [];
    const insert = that.getInsertHead();
    const values = txs.map((cert) => that.getInsertValue(cert));
    if (txs.length) {
      queries.push(insert + '\n' + values.join(',\n') + ';');
    }
    if (queries.length) {
      return that.exec(queries.join('\n'));
    }
  });
}
