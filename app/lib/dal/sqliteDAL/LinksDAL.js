/**
 * Created by cgeek on 22/08/15.
 */

const Q = require('q');
const co = require('co');
const logger = require('../../logger')('linksDAL');
const AbstractSQLite = require('./AbstractSQLite');

module.exports = LinksDAL;

function LinksDAL(driver, wotb) {

  "use strict";

  AbstractSQLite.call(this, driver);

  const that = this;

  this.table = 'link';
  this.fields = [
    'source',
    'target',
    'timestamp',
    'block_number',
    'block_hash',
    'obsolete',
    'from_wotb_id',
    'to_wotb_id'
  ];
  this.arrays = [];
  this.booleans = ['obsolete'];
  this.pkFields = ['source', 'target', 'block_number', 'block_hash'];
  this.translated = {};

  this.init = () => co(function *() {
    return that.exec('BEGIN;' +
      'CREATE TABLE IF NOT EXISTS ' + that.table + ' (' +
      'source VARCHAR(50) NOT NULL,' +
      'target VARCHAR(50) NOT NULL,' +
      'timestamp INTEGER NOT NULL,' +
      'block_number INTEGER NOT NULL,' +
      'block_hash VARCHAR(64),' +
      'obsolete BOOLEAN NOT NULL,' +
      'from_wotb_id INTEGER NULL,' +
      'to_wotb_id INTEGER NULL,' +
      'PRIMARY KEY (source,target,block_number,block_hash)' +
      ');' +
      'CREATE INDEX IF NOT EXISTS idx_link_source ON link (source);' +
      'CREATE INDEX IF NOT EXISTS idx_link_obsolete ON link (obsolete);' +
      'CREATE INDEX IF NOT EXISTS idx_link_target ON link (target);' +
      'CREATE INDEX IF NOT EXISTS idx_link_timestamp ON link (timestamp);' +
      'COMMIT;', []);
  });

  this.getValidLinksFrom = (pubkey) => this.sqlFind({
    source: pubkey,
    obsolete: false
  });

  this.getSimilarLinksFromDate = (from, to, minDate) => this.sqlFind({
    source: from,
    target: to,
    timestamp: { $gte: minDate }
  });

  this.getValidLinksTo = (pubkey) => this.sqlFind({
    target: pubkey,
    obsolete: false
  });

  this.getLinksWithPath = (from, to) =>
    this.sqlFind({
      source: from,
      target: to
    });

  this.getLinksFrom = (from) =>
    this.sqlFind({
      source: from
    });

  this.getLinksOfIssuerAbove = (from, aboveBlock) =>
    this.sqlFind({
      source: from,
      block_number: { $gt: aboveBlock }
    });

  this.obsoletesLinks = (minTimestamp) => co(function *() {
    const linksToObsolete = yield that.sqlFind({
      timestamp: { $lte: minTimestamp },
      obsolete: false
    });
    linksToObsolete.forEach((link) => wotb.removeLink(link.from_wotb_id, link.to_wotb_id, true));
    return that.sqlUpdateWhere({ obsolete: true }, {
      timestamp: { $lte: minTimestamp },
      obsolete: false
    });
  });

  this.unObsoletesLinks = (minTimestamp) => co(function *() {
    const linksToUnObsolete = yield that.sqlFind({
      timestamp: { $gte: minTimestamp },
      obsolete: true
    });
    linksToUnObsolete.forEach((link) => wotb.addLink(link.from_wotb_id, link.to_wotb_id));
    return that.sqlUpdateWhere({ obsolete: false }, {
      timestamp: { $gte: minTimestamp }
    });
  });

  this.removeLink = (link) => co(function *() {
    wotb.removeLink(link.from_wotb_id, link.to_wotb_id);
    return that.deleteEntity(link);
  });

  this.updateBatchOfLinks = (links) => co(function *() {
    const queries = [];
    const insert = that.getInsertHead();
    const values = links.map((link) => {
      wotb.addLink(link.from_wotb_id, link.to_wotb_id);
      return that.getInsertValue(link);
    });
    if (links.length) {
      queries.push(insert + '\n' + values.join(',\n') + ';');
      logger.query(queries.join('\n'));
    }
    if (queries.length) {
      return that.exec(queries.join('\n'));
    }
  });
}