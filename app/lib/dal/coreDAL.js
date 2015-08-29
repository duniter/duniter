"use strict";

var fileDAL = require('./fileDAL');
var util = require('util');
var _ = require('underscore');

module.exports = function(profile, blockNumber, blockHash, myFS, rootDAL) {
  return new CoreDAL(profile, blockNumber, blockHash, myFS, rootDAL);
};

function CoreDAL(profile, blockNumber, blockHash, myFS, rootDAL) {

  var that = this;
  var coreName = [blockNumber, blockHash].join('-');

  fileDAL.FileDAL.call(this, profile, 'branches/' + coreName, myFS, rootDAL);

  // Reading file = tree traversal reading
  var oldReadFile = that.readFile;
  that.setRead(function readFileFromFork() {
    var args = Array.prototype.slice.call(arguments);
    return oldReadFile.apply(that, args)
      .fail(function(){
        // Failed in core context, try in root
        return rootDAL.readFile.apply(rootDAL, args);
      });
  });

  // Listing files = tree traversal listing
  var oldListFile = that.listFile;
  that.setList(function listFilesFromFork() {
    var args = Array.prototype.slice.call(arguments);
    // Look at previous core, may be a recursive call of this function 'listFilesFromFork'
    // or a simple call to 'oldListFile' to end the recursion
    return rootDAL.listFile.apply(rootDAL, args)
      .then(function(files){
        // Call for this level
        return oldListFile.apply(that, args)
          .then(function(files2){
            return files.concat(files2);
          });
      });
  });

  // Removing a file = tree traversal remove IF SAID TO
  var oldRemoveFile = that.removeFile;
  that.setRemove(function removeFileFromFork() {
    var args = Array.prototype.slice.call(arguments);
    var recursive = args[1];
    return oldRemoveFile.apply(that, args)
      .fail(function(err){
        // Failed in core context, try in root IF SAID TO
        if (recursive) {
          return rootDAL.removeFile.apply(rootDAL, args);
        }
        // Otherwise, just throw the error
        throw err;
      });
  });

  this.name = ['coreDal', blockNumber, blockHash].join('_');

  this.setRootDAL = function(dal) {
    rootDAL = dal;
  };

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
