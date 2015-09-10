/**
 * Created by cgeek on 22/08/15.
 */

var AbstractDAL = require('./AbstractDAL');
var Q = require('q');
var _ = require('underscore');
var sha1 = require('sha1');

var BLOCK_FILE_PREFIX = "0000000000";
var BLOCK_FOLDER_SIZE = 500;

module.exports = BlockDAL;

function BlockDAL(dal) {

  "use strict";

  AbstractDAL.call(this, dal);
  var logger = require('../../../lib/logger')(dal.profile);
  var that = this;
  var treeMade;

  this.initTree = function() {
    if (!treeMade) {
      treeMade = Q.all([
        that.makeTree('blocks/')
      ]);
    }
    return treeMade;
  };

  this.getCurrent = function() {
    return that.initTree()
      .then(function(){
        return that.read('blocks/current.json');
      });
  };

  this.getBlock = function(number) {
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
                return parseInt(_.max(files2, function (f) {
                  return parseInt(f);
                }).replace(/\.json/, ''));
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
    return that.initTree()
      .then(function(){
        return that.makeTree(pathOfBlock(block.number));
      })
      .then(function(){
        return that.write(pathOfBlock(block.number) + blockFileName(block.number) + '.json', block);
      });
  };

  this.saveCurrent = function(block) {
    return that.initTree()
      .then(function(){
        return that.write('blocks/current.json', block);
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