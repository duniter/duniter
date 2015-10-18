/**
 * Created by cgeek on 22/08/15.
 */

var Q = require('q');
var _ = require('underscore');
var co = require('co');

var BLOCK_FILE_PREFIX = "0000000000";
var BLOCK_FOLDER_SIZE = 500;
var CACHE_SIZE = 1500;

module.exports = BlockDAL;

function BlockDAL(rootPath, qioFS, parentCore, localDAL, AbstractStorage) {

  "use strict";

  var that = this;

  AbstractStorage.call(this, rootPath, qioFS, parentCore, localDAL);

  var cache = [], current = null;
  var logger = require('../../../lib/logger')(this.dal.profile);

  this.init = () => {
    return co(function *() {
      yield that.coreFS.makeTree('blocks/');
      // TODO: not really proud of that, has to be refactored for more generic code
      if (that.dal.name == 'fileDal') {
        var dirs = yield that.coreFS.list('blocks/');
        dirs = dirs.map((dir) => parseInt(dir,10));
        dirs = dirs.sort();
        var maxDir = _.max(dirs);
        var toNOTcache = dirs.filter(function(dir) { return dir <= maxDir - CACHE_SIZE; });
        var toCache = dirs.filter(function(dir) { return dir > maxDir - CACHE_SIZE; });
        var highestFolderNOTtoCache = _.max(toNOTcache);
        cache = new Array((toNOTcache.length && highestFolderNOTtoCache) || 0);
        for (var i = 0; i < toCache.length; i++) {
          var currentDir = toCache[i];
          logger.debug('Caching blocks %s to %s...', parseInt(currentDir) - BLOCK_FOLDER_SIZE, currentDir);
          var blocks = yield that.coreFS.listJSON('blocks/' + currentDir);
          cache = cache.concat(blocks);
        }
        cache = _.sortBy(cache, function(block) { return (!block && -1) || block.number; });
      }
    });
  };

  this.getCurrent = () => {
    // TODO: not really proud of that, has to be refactored for more generic code
    if (that.dal.name == 'fileDal') {
      if (current) {
        return Q(current);
      }
    }
    return that.coreFS.readJSON('current.json');
  };

  this.getBlock = (number) => {
    // TODO: not really proud of that, has to be refactored for more generic code
    if (that.dal.name == 'fileDal') {
      if (cache[number]) {
        return Q(cache[number]);
      }
    }
    return that.coreFS.readJSON(pathOfBlock(number) + blockFileName(number) + '.json');
  };

  this.getLastSavedBlockFileNumber = () => {
    return co(function *() {
      var files = yield that.coreFS.list('blocks/');
      if(files.length == 0){
        return -1;
      } else {
        var maxDir = _.max(files, function(dir){ return parseInt(dir); });
        var files2 = yield that.coreFS.list('blocks/' + maxDir + '/');
        if(files2.length > 0) {
          var theFiles = files2.map(function(fileName) { return parseInt(fileName.replace(/\.json/, '')); });
          return _.max(theFiles);
        }
        else{
          // Last number is the one of the directory, minus the chunk of directory, minus 1
          return maxDir - BLOCK_FOLDER_SIZE - 1;
        }
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
    return co(function *() {
      yield that.coreFS.makeTree(pathOfBlock(block.number));
      var written = yield that.coreFS.writeJSON(pathOfBlock(block.number) + blockFileName(block.number) + '.json', block);
      // TODO: not really proud of that, has to be refactored for more generic code
      if (that.dal.name == 'fileDal') {
        if (cache.length != block.number) {
          // Reset cache
          cache = new Array(block.number - 1);
        }
        cache.push(block);
      }
      return written;
    });
  };

  this.saveCurrent = function(block) {
    return co(function *() {
      var written = yield that.coreFS.writeJSON('current.json', block);
      // TODO: not really proud of that, has to be refactored for more generic code
      if (that.dal.name == 'fileDal') {
        current = block;
      }
      return written;
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