/**
 * Created by cgeek on 22/08/15.
 */

var Q = require('q');
var _ = require('underscore');
var co = require('co');
var constants = require('../../constants');
var logger = require('../../../../app/lib/logger')('blockdal');

const BLOCK_FILE_PREFIX = "0000000000";
const BLOCK_FOLDER_SIZE = 500;

module.exports = BlockDAL;

function BlockDAL(loki, rootFS, getLowerWindowBlock) {

  "use strict";

  let collection = loki.getCollection('blocks') || loki.addCollection('blocks', { indices: ['fork', 'number', 'hash'] });
  let blocksDB = getView();
  let current = null;
  let that = this;

  this.init = () => co(function *() {
    yield rootFS.makeTree('blocks/');
  });

  this.getCurrent = () => {
    if (!current) {
      current = blocksDB.branchResultset().simplesort('number', true).limit(1).data()[0];
    }
    return Q(current);
  };

  this.getBlock = (number) => co(function *() {
    let block = blocksDB.branchResultset().find({ number: parseInt(number) }).data()[0];
    if (!block) {
      try {
        block = yield rootFS.readJSON(pathOfBlock(number) + blockFileName(number) + '.json');
      } catch(e) {
        block = null;
      }
    }
    return block;
  });

  this.getAbsoluteBlock = (number, hash) => co(function *() {
    let block = collection.find({
      $and: [{
        number: parseInt(number)
      }, {
        hash: hash
      }
    ]})[0];
    if (!block) {
      try {
        block = yield rootFS.readJSON(pathOfBlock(number) + blockFileName(number) + '.json');
      } catch(e) {
        block = null;
      }
    }
    return block;
  });

  this.blocksDB = blocksDB;
  this.collection = collection;

  this.getBlocks = (start, end) => {
    let lowerInLoki = collection.chain().simplesort('number').limit(1).data()[0];
    let lokiBlocks = blocksDB.branchResultset().find({
      $and: [{
        number: { $gte: start }
      }, {
        number: { $lte: end }
      }]
    }).data();
    if (lowerInLoki.number <= start) {
      return Q(lokiBlocks);
    }
    return co(function *() {
      let filesBlocks = yield Q.all(_.range(start, Math.min(lowerInLoki.number, end + 1)).map((number) => rootFS.readJSON(pathOfBlock(number) + blockFileName(number) + '.json')));
      return filesBlocks.concat(lokiBlocks);
    });
  };

  this.lastBlockWithDividend = () => {
    let blocks = blocksDB.branchResultset().find({ dividend: { $gt: 0 } }).simplesort('number', true).data();
    return blocks[0];
  };

  this.lastBlockOfIssuer = (issuer) => {
    let blocksOfIssuer = blocksDB.branchResultset().find({ issuer: issuer }).simplesort('number', true).limit(1).data();
    return Q(blocksOfIssuer[0]);
  };

  this.getForkBlocks = () =>
    Q(this.collection.find({
      $and: [
        { fork: true },
        { wrong: false }
      ]
    }));

  this.saveBunch = (blocks, inFiles) => {
    if (!inFiles) {
      collection.insert(blocks);
      return Q();
    } else {
      // Save in files
      return co(function *() {
        let trees = [];
        blocks.forEach(function(block){
          let pathForBlock = pathOfBlock(block.number);
          if (!~trees.indexOf(pathForBlock)) {
            trees.push(pathForBlock);
          }
        });
        yield trees.map((tree) => rootFS.makeTree(tree));
        yield blocks.map((block) => rootFS.writeJSON(pathOfBlock(block.number) + blockFileName(block.number) + '.json', block));
      });
    }
  };

  this.saveBlock = (block) => {
    if (!current || current.number < block.number) {
      current = block;
    }
    let existing;
    existing = collection.find({
      $and: [{
        number: block.number
      }, {
        hash: block.hash
      }]
    })[0];
    if (existing) {
      // Updates
      collection.update(_.extend(existing, block));
    } else {
      collection.insert(block);
    }
    return Q(block);
  };

  this.saveSideBlock = (block) => {
    block.fork = true;
    let existing;
    existing = collection.find({
      $and: [{
        number: block.number
      }, {
        hash: block.hash
      }]
    })[0];
    if (existing) {
      // Updates
      collection.update(_.extend(existing, block));
    } else {
      collection.insert(block);
    }
    return Q(block);
  };

  this.setSideBlock = (block, previousBlock) => co(function *() {
    let existing = collection.find({
      $and: [{
        number: block.number
      }, {
        hash: block.hash
      }]
    });
    (existing || []).forEach(function(found){
      found.fork = true;
      collection.update(found);
    });
    current = previousBlock;
    let lowerInLoki = collection.chain().simplesort('number').limit(1).data()[0];
    if (lowerInLoki.number > 0) {
      let newLower = yield that.getBlock(lowerInLoki.number - 1);
      yield rootFS.remove(pathOfBlock(newLower.number) + blockFileName(newLower.number) + '.json');
      collection.insert(newLower);
    }
  });

  this.migrateOldBlocks = () => co(function *() {
    let number = yield getLowerWindowBlock();
    logger.debug("Clean some blocks from memory to disk...");
    logger.debug("Lower block = %s", number);
    let lowerInLoki = collection.chain().simplesort('number').limit(1).data()[0];
    if (!lowerInLoki) {
      return;
    }
    let lastUDBlock = that.lastBlockWithDividend();
    if (lastUDBlock) {
      logger.debug("LastUD in loki = %s", lastUDBlock.number);
      logger.debug("Lower in loki = %s", lowerInLoki.number);
      let deadBlocksInLoki = number - lowerInLoki.number;
      logger.debug("Dead blocks = %s", deadBlocksInLoki);
      if (deadBlocksInLoki >= constants.BLOCKS_COLLECT_THRESHOLD) {
        let blocksToPersist = blocksDB.branchResultset().find({
          $and: [{
            number: { $gte: lowerInLoki.number }
          }, {
            number: { $lte: number }
          }]
        }).simplesort('number').data();
        logger.debug("To store in files = %s to %s", blocksToPersist[0].number, blocksToPersist[blocksToPersist.length - 1].number);
        for (let i = 0; i < blocksToPersist.length; i++) {
          let block = blocksToPersist[i];
          yield rootFS.makeTree(pathOfBlock(block.number));
          yield rootFS.writeJSON(pathOfBlock(block.number) + blockFileName(block.number) + '.json', block);
          collection.remove(block);
        }
        lowerInLoki = collection.chain().simplesort('number').limit(1).data()[0];
        logger.debug("Lower in loki now = %s", lowerInLoki.number);
        logger.debug("LastUD in loki = %s", that.lastBlockWithDividend().number);
      }
    }
  });

  function getView() {
    let view;
    // Main branch
    view = collection.addDynamicView('mainBranch');
    view.applyFind({ fork: false });
    return view;
  }

  function folderOfBlock(blockNumber) {
    return (Math.floor(blockNumber / BLOCK_FOLDER_SIZE) + 1) * BLOCK_FOLDER_SIZE;
  }

  function pathOfBlock(blockNumber) {
    return 'blocks/' + folderOfBlock(blockNumber) + '/';
  }

  function blockFileName(blockNumber) {
    return BLOCK_FILE_PREFIX.substr(0, BLOCK_FILE_PREFIX.length - ("" + blockNumber).length) + blockNumber;
  }
}
