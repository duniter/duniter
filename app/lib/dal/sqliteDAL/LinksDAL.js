/**
 * Created by cgeek on 22/08/15.
 */

var Q = require('q');
var co = require('co');
var AbstractSQLite = require('./AbstractSQLite');

module.exports = LinksDAL;

function LinksDAL(db) {

  "use strict";

  AbstractSQLite.call(this, db);

  let that = this;

  this.table = 'link';
  this.fields = [
    'source',
    'target',
    'timestamp',
    'block_number',
    'block_hash',
    'obsolete'
  ];
  this.arrays = [];
  this.booleans = ['obsolete'];
  this.pkFields = ['source', 'target', 'block_number', 'block_hash'];
  this.translated = {};

  this.init = () => co(function *() {
    return that.exec('BEGIN;' +
      'CREATE TABLE IF NOT EXISTS ' + that.table + ' (' +
      'source VARCHAR(50) NOT NULL,' +
      'target CHAR(40) NOT NULL,' +
      'timestamp INTEGER NOT NULL,' +
      'block_number INTEGER NOT NULL,' +
      'block_hash VARCHAR(50),' +
      'obsolete BOOLEAN NOT NULL,' +
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

  this.obsoletesLinks = (minTimestamp) => co(function *() {
    return that.sqlUpdateWhere({ obsolete: true }, {
      timestamp: { $lte: minTimestamp },
      obsolete: false
    });
  });

  this.unObsoletesLinks = (minTimestamp) => co(function *() {
    return that.sqlUpdateWhere({ obsolete: false }, {
      timestamp: { $gte: minTimestamp }
    });
  });

  this.addLink = (link) => {
    link.obsolete = false;
    return that.saveEntity(link);
  };

  this.removeLink = (link) =>
    this.deleteEntity(link);

  this.updateBatchOfLinks = (links) => co(function *() {
    let queries = [];
    let insert = that.getInsertHead();
    let values = links.map((cert) => that.getInsertValue(cert));
    if (links.length) {
      queries.push(insert + '\n' + values.join(',\n') + ';');
    }
    if (queries.length) {
      return that.exec(queries.join('\n'));
    }
  });
}