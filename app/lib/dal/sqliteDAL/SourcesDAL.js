/**
 * Created by cgeek on 22/08/15.
 */

const co = require('co');
const _ = require('underscore');
const AbstractSQLite = require('./AbstractSQLite');

module.exports = SourcesDAL;

function SourcesDAL(driver) {

  "use strict";

  AbstractSQLite.call(this, driver);

  const that = this;

  this.table = 'source';
  this.fields = [
    'type',
    'number',
    'time',
    'identifier',
    'amount',
    'base',
    'noffset',
    'block_hash',
    'consumed',
    'conditions'
  ];
  this.arrays = [];
  this.bigintegers = ['amount'];
  this.booleans = ['consumed'];
  this.pkFields = ['identifier', 'noffset'];
  this.translated = {};

  this.init = () => co(function *() {
    return that.exec('BEGIN;' +
      'CREATE TABLE IF NOT EXISTS ' + that.table + ' (' +
      'type VARCHAR(1) NOT NULL,' +
      'number INTEGER NOT NULL,' +
      'time DATETIME,' +
      'identifier VARCHAR(64) NOT NULL,' +
      'noffset INTEGER NOT NULL,' +
      'amount VARCHAR(50) NOT NULL,' +
      'base INTEGER NOT NULL,' +
      'block_hash VARCHAR(64) NOT NULL,' +
      'consumed BOOLEAN NOT NULL,' +
      'conditions TEXT,' +
      'PRIMARY KEY (identifier,noffset)' +
      ');' +
      'CREATE INDEX IF NOT EXISTS idx_source_type ON source (type);' +
      'CREATE INDEX IF NOT EXISTS idx_source_number ON source (number);' +
      'CREATE INDEX IF NOT EXISTS idx_source_identifier ON source (identifier);' +
      'CREATE INDEX IF NOT EXISTS idx_source_noffset ON source (noffset);' +
      'CREATE INDEX IF NOT EXISTS idx_source_conditions ON source (conditions);' +
      'COMMIT;', []);
  });

  this.getAvailableForPubkey = (pubkey) => this.sqlFind({
    conditions: { $contains: pubkey },
    consumed: false
  });

  this.getUDSources = (pubkey) => this.sqlFind({
    conditions: { $contains: pubkey },
    type: 'D'
  });

  this.getSource = (identifier, index) => this.sqlFindOne({
    identifier: identifier,
    noffset: index
  });

  this.getSource = (identifier, noffset) => that.sqlExisting({
    identifier: identifier,
    noffset: noffset
  });

  this.consumeSource = (identifier, index) => co(function *() {
    return that.updateEntity({
      identifier: identifier,
      noffset: index
    },{
      consumed: true
    });
  });

  this.addSource = (type, number, identifier, noffset, amount, base, block_hash, time, conditions) => this.saveEntity({
    type: type,
    number: number,
    identifier: identifier,
    noffset: noffset,
    amount: amount,
    base: base,
    time: time,
    block_hash: block_hash,
    consumed: false,
    conditions: conditions
  });

  this.unConsumeSource = (identifier, index) => co(function *() {
    let src = yield that.sqlExisting({
      identifier: identifier,
      noffset: index
    });
    if (!src) {
      throw "Cannot revert: inputs used by the blocks were removed from the DB";
    } else {
      return that.updateEntity({
        identifier: identifier,
        noffset: index
      },{
        consumed: false
      });
    }
  });

  this.updateBatchOfSources = (sources) => co(function *() {
    const inserts = _.filter(sources, { toConsume: false });
    const updates = _.filter(sources, { toConsume: true });
    const queries = [];
    if (inserts.length) {
      const insert = that.getInsertHead();
      const values = inserts.map((src) => that.getInsertValue(_.extend(src, { consumed: false })));
      queries.push(insert + '\n' + values.join(',\n') + ';');
    }
    if (updates.length) {
      const del = that.getConsumeHead();
      const values = that.getConsumeValues(updates);
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
