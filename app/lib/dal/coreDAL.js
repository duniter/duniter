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

  fileDAL.FileDAL.call(this, profile, 'branches/' + coreName, myFS);

  //// Get currency = tree traversal reading
  //that.getCurrency = function() {
  //  return rootDAL.getCurrency();
  //};

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

  // Writing a file = local writing, unless told to do a root writing
  var oldWriteFile = that.writeFile;
  that.setWrite(function writeFileFromFork() {
    var args = Array.prototype.slice.call(arguments);
    if (args[2]) {
      return rootDAL.writeFile.apply(rootDAL, args);
    }
    return oldWriteFile.apply(that, args)
      .fail(function(){
        // Failed in core context, try in root
        return rootDAL.writeFile.apply(rootDAL, args);
      });
  });

  // Listing files = tree traversal listing
  var oldListFile = that.listFile;
  that.setList(function listFilesFromFork() {
    var args = Array.prototype.slice.call(arguments);
    if (args[1]) {
      // Only local listing
      return oldListFile.apply(that, args)
        .then(function(files2){
          return _.uniq(files2, false, function(file) { return file.file; });
        });
    }
    // Look at previous core, may be a recursive call of this function 'listFilesFromFork'
    // or a simple call to 'oldListFile' to end the recursion
    return rootDAL.listFile.apply(rootDAL, args)
      .then(function(files){
        // Call for this level
        return oldListFile.apply(that, args)
          .then(function(files2){
            return _.uniq(files.concat(files2), false, function(file) { return file.file; });
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
}

util.inherits(CoreDAL, fileDAL.FileDAL);
