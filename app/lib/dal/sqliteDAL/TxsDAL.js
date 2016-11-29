/**
 * Created by cgeek on 22/08/15.
 */

const Q = require('q');
const co = require('co');
const moment = require('moment');
const constants = require('../../constants');
const Transaction = require('../../entity/transaction');
const AbstractSQLite = require('./AbstractSQLite');
const SandBox = require('./SandBox');

module.exports = TxsDAL;

function TxsDAL(driver) {

  "use strict";

  AbstractSQLite.call(this, driver);

  const that = this;

  this.table = 'txs';
  this.fields = [
    'hash',
    'v4_hash',
    'v5_hash',
    'block_number',
    'version',
    'currency',
    'comment',
    'blockstamp',
    'blockstampTime',
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
    'recipients',
    'output_base',
    'output_amount'
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

  this.getAllPending = (versionMin) => this.sqlFind({
    written: false,
    removed: false,
    version: { $gte: versionMin }
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
    written: true,
    removed: false
  });

  this.getLinkedWithRecipient = (pubkey) => this.sqlFind({
    recipients: { $contains: pubkey },
    written: true,
    removed: false
  });

  this.getPendingWithIssuer = (pubkey) => this.sqlFind({
    issuers: { $contains: pubkey },
    written: false,
    removed: false
  });

  this.getPendingWithRecipient = (pubkey) => this.sqlFind({
    recipients: { $contains: pubkey },
    written: false,
    removed: false
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

  this.getTransactionByExtendedHash = (hash) => that.query("SELECT * FROM txs WHERE hash = ? OR v4_hash = ? OR v5_hash = ?", [hash, hash, hash]);

  /**************************
   * SANDBOX STUFF
   */

  this.getSandboxTxs = () => that.query('SELECT * FROM sandbox_txs LIMIT ' + (that.sandbox.maxSize), []);

  this.sandbox = new SandBox(constants.SANDBOX_SIZE_TRANSACTIONS, this.getSandboxTxs.bind(this), (compared, reference) => {
    if (compared.output_base < reference.output_base) {
      return -1;
    }
    else if (compared.output_base > reference.output_base) {
      return 1;
    }
    else if (compared.output_amount > reference.output_amount) {
      return -1;
    }
    else if (compared.output_amount < reference.output_amount) {
      return 1;
    }
    else {
      return 0;
    }
  });

  this.getSandboxRoom = () => this.sandbox.getSandboxRoom();
  this.setSandboxSize = (maxSize) => this.sandbox.maxSize = maxSize;
}
