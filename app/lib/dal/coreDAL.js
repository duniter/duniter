"use strict";
var fileDAL = require('./fileDAL');
var util = require('util');

module.exports = function(profile, blockNumber, blockHash, myFS, rootDAL) {
  return new CoreDAL(profile, blockNumber, blockHash, myFS, rootDAL);
};

function CoreDAL(profile, blockNumber, blockHash, myFS, rootDAL) {

  fileDAL.FileDAL.call(this, profile, 'branches/' + [blockNumber, blockHash].join('-'), myFS, rootDAL);

  var that = this;

  this.name = ['coreDal', blockNumber, blockHash].join('_');

  // Encapsulate rootDAL to redirect getBlock
  var originalGetBlock = this.getBlock;

  // Redefine getBlock function
  this.getBlock = function(number, done) {
    var p = number < blockNumber ? rootDAL.getBlock(number) : originalGetBlock(number);
    return p
      .then(function(block){
        done && done(null, block);
        return block;
      })
      .fail(function(err){
        done && done(err);
        throw err;
      });
  };

  // Encapsulate rootDAL to redirect getBlock
  var originalGetBlockByNumberAndHash = this.getBlockByNumberAndHash;

  // Redefine getBlock function

  this.getBlockByNumberAndHash = function(number, hash, done) {
    var p = number < blockNumber ? rootDAL.getBlockByNumberAndHash(number, hash) : originalGetBlockByNumberAndHash(number, hash);
    return p
      .then(function(block){
        done && done(null, block);
        return block;
      })
      .fail(function(err){
        done && done(err);
        throw err;
      });
  };

  // Encapsulate rootDAL to redirect getBlock
  var originalSaveBlock = this.saveBlock;

  // Redefine getBlock function
  this.saveBlock = function(block, done) {
    return originalSaveBlock(block, done);
  };

  // Encapsulate rootDAL to redirect getBlock
  var originalGetCurrentNumber = this.getCurrentNumber;

  // Redefine getBlock function
  this.getCurrentNumber = function() {
    return originalGetCurrentNumber()
      .then(function(currentNumber){
        if (currentNumber == -1) {
          // The core has not received its block yet
          return blockNumber - 1;
        }
        return currentNumber;
      });
  };
}

util.inherits(CoreDAL, fileDAL.FileDAL);
