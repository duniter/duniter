/**
 * Created by cgeek on 22/08/15.
 */

var Q = require('q');
var _ = require('underscore');

module.exports = BlockDAL;

function BlockDAL(fileDAL, loki) {

  "use strict";

  let collection = loki.getCollection('blocks') || loki.addCollection('blocks', { indices: ['fork', 'number', 'hash'] });
  let blocksDB = getView();

  this.init = () => null;

  this.getCurrent = () => Q(blocksDB.branchResultset().simplesort('number', true).limit(1).data()[0]);

  this.getBlock = (number) => Q(blocksDB.branchResultset().find({ number: parseInt(number) }).data()[0]);

  this.blocksDB = blocksDB;
  this.collection = collection;

  this.getLastSavedBlockFileNumber = () => Q(collection.chain().simplesort('number', true).limit(1).data()[0]);

  this.saveBlock = (block) => {
    _.extend(block, { fork: !!fileDAL.parentDAL });
    let existing = collection.find({
      $and: [{
        number: block.number
      }, {
        hash: block.hash
      }]
    })[0];
    if (existing) {
      existing = _.extend(existing, block);
      collection.update(existing);
    } else {
      collection.insert(block);
    }
    return Q(block);
  };

  function getView() {
    let view;
    if (!fileDAL.parentDAL) {
      // Main branch
      view = collection.addDynamicView('mainBranch');
      view.applyFind({ fork: false });
    }
    else {
      let blocks = [], p = fileDAL;
      while (p) {
        if (p.core) {
          blocks.push(p.core);
        }
        p = p.parentDAL;
      }
      blocks = _.sortBy(blocks, (b) => b.number);
      let conditions = blocks.map((b) => { return { $and: [{
        fork: true
      }, {
        number: b.forkPointNumber
      }, {
        hash: b.forkPointHash
      }] }; });
      conditions.unshift({ fork: false });
      view = collection.addDynamicView(['branch', fileDAL.name].join('_'));
      view.applyFind({ '$or': conditions });
      view.conditions = conditions;
    }
    return view;
  }
}
