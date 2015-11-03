/**
 * Created by cgeek on 22/08/15.
 */

var co = require('co');
var Q = require('q');
var AbstractLoki = require('./AbstractLoki');

module.exports = LinksDAL;

function LinksDAL(fileDAL, loki) {

  "use strict";

  let that = this;
  let collection = loki.getCollection('links') || loki.addCollection('links', { indices: ['source', 'target', 'block_number', 'block_hash', 'timestamp'] });

  AbstractLoki.call(this, collection, fileDAL, {
    block_number: 'block_number',
    block_hash: 'block_hash'
  }, loki);

  this.idKeys = ['source', 'target', 'block_number', 'block_hash'];
  this.metaProps = ['obsolete'];
  this.propsToSave = [
    'source',
    'target',
    'timestamp',
    'block_number',
    'block_hash',
    'obsolete'
  ];

  this.init = () => null;

  this.getValidLinksFrom = (pubkey) => this.lokiFind({
    source: pubkey
  }, {
    obsolete: false
  });

  this.getValidLinksTo = (pubkey) => this.lokiFind({
    target: pubkey
  }, {
    obsolete: false
  });

  this.getObsoleteLinksFromTo = (from, to) => this.lokiFind({
    $and: [{
      source: from
    },{
      to: to
    }]
  }, {
    obsolete: true
  });

  this.obsoletesLinks = (minTimestamp) => co(function *() {
    let toObsolete = yield that.lokiFind({
      timestamp: { $lte: minTimestamp }
    },{
      obsolete: false
    });
    for (let i = 0; i < toObsolete.length; i++) {
      let link = toObsolete[i];
      link.obsolete = true;
      collection.update(link);
    }
  });

  this.addLink = (link) => {
    link.obsolete = false;
    return this.lokiSave(link);
  };
}