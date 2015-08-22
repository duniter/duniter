"use strict";

var fileDAL = require('./fileDAL');
var util = require('util');

module.exports = function(profile, blockNumber, blockHash, myFS, rootDAL) {
  return new CoreDAL(profile, blockNumber, blockHash, myFS, rootDAL);
};

function CoreDAL(profile, blockNumber, blockHash, myFS, rootDAL) {

  var that = this;
  var coreName = [blockNumber, blockHash].join('-');

  fileDAL.FileDAL.call(this, profile, 'branches/' + coreName, myFS, rootDAL);

  var oldReadFile = that.readFile;
  that.setRead(function readFileFromFork() {
    var args = Array.prototype.slice.call(arguments);
    return oldReadFile.apply(that, args)
      .tap(function(){
        console.warn('Found in ' + args[0]);
      })
      .fail(function(err){
        if (err.path) {
          var argsStr = JSON.stringify(args).substr(1);
          argsStr = argsStr.substr(0, argsStr.length - 1);
          console.warn('Failed to read: %s', argsStr, err.path);
        }
        //console.log('Did not find the file for core ' + coreName + '.' + readFunc.surname);
        // Failed in core context, try in root
        return rootDAL.readFile.apply(rootDAL, args)
          .tap(function(){
            console.warn('Found in ' + rootDAL.name);
          });
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
