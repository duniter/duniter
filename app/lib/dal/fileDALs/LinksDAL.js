/**
 * Created by cgeek on 22/08/15.
 */

var Q = require('q');
var AbstractLoki = require('./AbstractLoki');

module.exports = LinksDAL;

function LinksDAL(fileDAL, loki) {

  "use strict";

  let collection = loki.getCollection('links') || loki.addCollection('links', { indices: ['source', 'target', 'block_number', 'block_hash', 'timestamp'] });
  let blockCollection = loki.getCollection('blocks');
  let current = blockCollection.chain().find({ fork: false }).simplesort('number', true).limit(1).data()[0];
  let blocks = [], p = fileDAL;
  let branchView;
  while (p) {
    if (p.core) {
      blocks.push(p.core);
    }
    p = p.parentDAL;
  }
  let conditions = blocks.map((b) => {
    return {
      $and: [{
        block_number: b.forkPointNumber
      }, {
        block_hash: b.forkPointHash
      }]
    };
  });
  conditions.unshift({
    block_number: { $lte: current ? current.number : -1 }
  });
  branchView = collection.addDynamicView(['branchl', fileDAL.name].join('_'));
  branchView.applyFind({ '$or': conditions });
  branchView.conditions = conditions;

  AbstractLoki.call(this, collection, fileDAL, branchView);

  this.idKeys = ['source', 'target', 'block_number', 'block_hash'];
  this.metaProps = ['obsolete'];

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

  this.obsoletesLinks = (minTimestamp) => {
    let toObsolete = branchView.branchResultset().find({
      timestamp: { $lte: minTimestamp }
    });
    for (let i = 0; i < toObsolete.length; i++) {
      let link = toObsolete[i];
      link.obsolete = true;
      collection.update(link);
    }
    return Q();
  };

  this.addLink = (link) => {
    link.obsolete = false;
    return this.lokiSave(link);
  };
}