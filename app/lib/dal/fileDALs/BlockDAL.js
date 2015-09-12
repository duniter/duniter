/**
 * Created by cgeek on 22/08/15.
 */

var AbstractDAL = require('./AbstractDAL');
var Q = require('q');
var _ = require('underscore');
var sha1 = require('sha1');

var BLOCK_FILE_PREFIX = "0000000000";
var BLOCK_FOLDER_SIZE = 500;
var CACHE_SIZE = 25000;

module.exports = BlockDAL;

function BlockDAL(dal) {

  "use strict";

  var cache = [], current = null;

  AbstractDAL.call(this, dal);
  var logger = require('../../../lib/logger')(dal.profile);
  var that = this;
  var treeMade;

  this.initTree = function() {
    if (!treeMade) {
      treeMade = Q.all([
        that.makeTree('blocks/')
      ])
        .then(function(){
          // TODO: not really proud of that, has to be refactored for more generic code
          if (that.dal.name == 'fileDal') {
            // Load in cache
            return that.list('blocks/')
              .then(function(files){
                return _.pluck(files, 'file').map(function(dir) { return parseInt(dir); });
              })
              .then(function(files){
                files = _.sortBy(files, function(dir) { return parseInt(dir); });
                var maxDir = _.max(files);
                var toNOTcache = files.filter(function(dir) { return dir <= maxDir - CACHE_SIZE; });
                var toCache = files.filter(function(dir) { return dir > maxDir - CACHE_SIZE; });
                var highestFolderNOTtoCache = _.max(toNOTcache);
                cache = new Array((toNOTcache.length && highestFolderNOTtoCache) || 0);
                return toCache.reduce(function(p, dir) {
                  return p
                    .then(function(){
                      logger.debug('Caching blocks %s to %s...', parseInt(dir) - BLOCK_FOLDER_SIZE, dir);
                      return that.list('blocks/' + dir);
                    })
                    .then(function(files2){
                      return _.pluck(files2, 'file');
                    })
                    .then(function(files2){
                      return files2.reduce(function(p2, blockFileName) {
                        return p2
                          .then(function(){
                            return that.read('blocks/' + dir + '/' + blockFileName);
                          })
                          .then(function(block){
                            cache.push(block);
                          });
                      }, Q());
                    });
                }, Q())
                  .then(function(){
                    cache = _.sortBy(cache, function(block) { return (!block && -1) || block.number; });
                  });
              });
          }
        });
    }
    return treeMade;
  };

  this.getCurrent = function() {
    // TODO: not really proud of that, has to be refactored for more generic code
    if (that.dal.name == 'fileDal') {
      if (current) {
        return Q(current);
      }
    }
    return that.initTree()
      .then(function(){
        return that.read('current.json');
      });
  };

  this.getBlock = function(number) {
    // TODO: not really proud of that, has to be refactored for more generic code
    if (that.dal.name == 'fileDal') {
      if (cache[number]) {
        return Q(cache[number]);
      }
    }
    return that.initTree()
      .then(function(){
        return that.read(pathOfBlock(number) + blockFileName(number) + '.json');
      });
  };

  this.getLastSavedBlockFileNumber = function() {
    return that.initTree()
      .then(function(){
        return that.list('blocks/');
      })
      .then(function(files){
        return _.pluck(files, 'file');
      })
      .then(function(files){
        if(files.length == 0){
          return -1;
        } else {
          var maxDir = _.max(files, function(dir){ return parseInt(dir); });
          return that.list('blocks/' + maxDir + '/')
            .then(function(files2){
              if(files2.length > 0) {
                var theFiles = _.pluck(files2, 'file').map(function(fileName) { return parseInt(fileName.replace(/\.json/, '')); });
                return _.max(theFiles);
              }
              else{
                // Last number is the one of the directory, minus the chunk of directory, minus 1
                return maxDir - BLOCK_FOLDER_SIZE - 1;
              }
            });
        }
      });
  };

  this.saveBlock = function(block) {
    // TODO: not really proud of that, has to be refactored for more generic code
    if (that.dal.name == 'fileDal') {
      if (block.number < cache.length) {
        return Q(block);
      }
    }
    // Write if necessary
    return that.initTree()
      .then(function(){
        return that.makeTree(pathOfBlock(block.number));
      })
      .then(function(){
        return that.write(pathOfBlock(block.number) + blockFileName(block.number) + '.json', block);
      })
      .tap(function() {
        // TODO: not really proud of that, has to be refactored for more generic code
        if (that.dal.name == 'fileDal') {
          if (cache.length != block.number) {
            throw 'Block cache is concurrently written';
          }
          cache.push(block);
        }
      });
  };

  this.saveCurrent = function(block) {
    return that.initTree()
      .then(function(){
        return that.write('current.json', block);
      })
      .tap(function() {
        // TODO: not really proud of that, has to be refactored for more generic code
        if (that.dal.name == 'fileDal') {
          current = block;
        }
      });
  };

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