/**
 * Created by cgeek on 22/08/15.
 */

var co = require('co');
var _ = require('underscore');
var AbstractSQLite = require('./AbstractSQLite');

module.exports = SourcesDAL;

function SourcesDAL(db) {

  "use strict";

  AbstractSQLite.call(this, db);

  let that = this;

  this.table = 'source';
  this.fields = [
    'pubkey',
    'type',
    'number',
    'time',
    'fingerprint',
    'amount',
    'block_hash',
    'consumed'
  ];
  this.arrays = [];
  this.bigintegers = ['amount'];
  this.booleans = ['consumed'];
  this.pkFields = ['pubkey', 'type', 'number', 'fingerprint', 'amount'];
  this.translated = {};

  this.init = () => co(function *() {
    return that.exec('BEGIN;' +
      'CREATE TABLE IF NOT EXISTS ' + that.table + ' (' +
      'pubkey VARCHAR(50) NOT NULL,' +
      'type VARCHAR(1) NOT NULL,' +
      'number INTEGER NOT NULL,' +
      'time DATETIME,' +
      'fingerprint VARCHAR(64) NOT NULL,' +
      'amount VARCHAR(50) NOT NULL,' +
      'block_hash VARCHAR(64) NOT NULL,' +
      'consumed BOOLEAN NOT NULL,' +
      'PRIMARY KEY (pubkey,type,number,fingerprint,amount)' +
      ');' +
      'CREATE INDEX IF NOT EXISTS idx_source_pubkey ON source (pubkey);' +
      'CREATE INDEX IF NOT EXISTS idx_source_type ON source (type);' +
      'CREATE INDEX IF NOT EXISTS idx_source_number ON source (number);' +
      'CREATE INDEX IF NOT EXISTS idx_source_fingerprint ON source (fingerprint);' +
      'COMMIT;', []);
  });

  this.getAvailableForPubkey = (pubkey) => this.sqlFind({
    pubkey: pubkey,
    consumed: false
  });

  this.getUDSources = (pubkey) => this.sqlFind({
    pubkey: pubkey,
    type: 'D'
  });

  this.getSource = (pubkey, type, number) => this.sqlFindOne({
    pubkey: pubkey,
    type: type,
    number: number
  });

  this.isAvailableSource = (pubkey, type, number, fingerprint, amount) => co(function *() {
    let src = yield that.sqlExisting({
      pubkey: pubkey,
      type: type,
      number: number,
      fingerprint: fingerprint,
      amount: amount
    });
    return src ? !src.consumed : false;
  });

  this.consumeSource = (pubkey, type, number, fingerprint, amount) => co(function *() {
    return that.updateEntity({
      pubkey: pubkey,
      type: type,
      number: number,
      fingerprint: fingerprint,
      amount: amount
    },{
      consumed: true
    });
  });

  this.addSource = (state, pubkey, type, number, fingerprint, amount, block_hash, time) => this.saveEntity({
    pubkey: pubkey,
    type: type,
    number: number,
    fingerprint: fingerprint,
    amount: amount,
    time: time,
    block_hash: block_hash,
    consumed: false
  });

  this.unConsumeSource = (type, pubkey, number, fingerprint, amount, time, block_hash) => co(function *() {
    let src = yield that.sqlExisting({
      pubkey: pubkey,
      type: type,
      number: number,
      fingerprint: fingerprint,
      amount: amount
    });
    if (!src) {
      return this.saveEntity({
        pubkey: pubkey,
        type: type,
        number: number,
        fingerprint: fingerprint,
        amount: amount,
        time: time,
        block_hash: block_hash,
        consumed: false
      });
    } else {
      return that.updateEntity({
        pubkey: pubkey,
        type: type,
        number: number,
        fingerprint: fingerprint,
        amount: amount,
        block_hash: block_hash
      },{
        consumed: false
      });
    }
  });

  this.updateBatchOfSources = (sources) => co(function *() {
    let inserts = _.filter(sources, { toConsume: false });
    let updates = _.filter(sources, { toConsume: true });
    let queries = [];
    if (inserts.length) {
      let insert = that.getInsertHead();
      let values = inserts.map((src) => that.getInsertValue(_.extend(src, { consumed: false })));
      queries.push(insert + '\n' + values.join(',\n') + ';');
    }
    if (updates.length) {
      let del = that.getDeleteHead();
      let values = that.getDeleteValues(updates);
      queries.push(del + '\n' + values + ';');
    }
    if (queries.length) {
      return that.exec(queries.join('\n'));
    }
  });

  this.removeAllSourcesOfBlock = (number) => this.sqlRemoveWhere({
    number: number
  });
}