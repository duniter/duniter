"use strict";

var fileDAL = require('./fileDAL');
var util = require('util');
var _ = require('underscore');
var Q = require('q');

module.exports = function(profile, blockNumber, blockHash, myFS, rootDAL) {
  return new CoreDAL(profile, blockNumber, blockHash, myFS, rootDAL);
};

function CoreDAL(profile, blockNumber, blockHash, myFS, rootDAL, considerCacheInvalidateByDefault) {

  var that = this;
  var coreName = [blockNumber, blockHash].join('-');

  fileDAL.FileDAL.call(this, profile, 'branches/' + coreName, myFS, rootDAL);

  //// Get currency = tree traversal reading
  //that.getCurrency = function() {
  //  return rootDAL.getCurrency();
  //};

  // Reading file = tree traversal reading
  var oldReadFile = that.readFile;
  that.setRead(function readFileFromFork() {
    var args = Array.prototype.slice.call(arguments);
    return oldReadFile.apply(that, args)
      .catch(function(){
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
      .catch(function(){
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
      .catch(function(err){
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
    _.keys(that.newDals).map((dalName) => {
      var localDal = that.newDals[dalName];
      var parentDal = dal.newDals[dalName];
      localDal.changeParentCore(parentDal.coreFS);
    });
  };

  var coreCache = {}, cacheValidation = {};

  _.keys(that.dals).forEach(function(dalName){

    coreCache[dalName] = coreCache[dalName] || {};
    cacheValidation[dalName] = cacheValidation[dalName] || {};

    var simpleDAL = that.dals[dalName], rootSimpleDAL = rootDAL.dals[dalName];

    // Read cache
    (_.keys(simpleDAL.cached) || []).forEach(function(cacheKey){

      coreCache[dalName][cacheKey] = {};

      simpleDAL.cached[cacheKey].forEach(function(pickerName) {

        // Decorates function with cache
        //var originalFunc = simpleDAL[pickerName];
        simpleDAL[pickerName] = function() {
          var args = Array.prototype.slice.call(arguments);
          // Check cache
          if (coreCache[dalName][cacheKey][args[0]]) {
            return Q(coreCache[dalName][cacheKey][args[0]]);
          }
          // Otherwise call the root dal function
          return rootSimpleDAL[pickerName].apply(rootSimpleDAL, args);
        };
      });
    });

    // List cache
    (_.keys(simpleDAL.cachedLists) || []).forEach(function(cacheKey){

      coreCache[dalName][cacheKey] = {};
      cacheValidation[dalName][cacheKey] = {};

      simpleDAL.cachedLists[cacheKey].forEach(function(pickerName) {

        // Decorates function with cache
        var originalFunc = simpleDAL[pickerName];
        simpleDAL[pickerName] = function() {
          var args = Array.prototype.slice.call(arguments);
          // Check cache
          if (coreCache[dalName][cacheKey][args[0]]) {
            return Q(coreCache[dalName][cacheKey][args[0]]);
          }
          // Otherwise check if the cache has been invalidated (due to some writing).
          if (cacheValidation[dalName][cacheKey][args[0]] === false || (cacheValidation[dalName][cacheKey][args[0]] === undefined && considerCacheInvalidateByDefault)) {
            // If invalidated -> recompute the listing values
            return originalFunc.apply(simpleDAL, args)
              .then(function(result){
                cacheValidation[dalName][cacheKey][args[0]] = true;
                coreCache[dalName][cacheKey][args[0]] = result;
                return result;
              });
          }
          // Else -> forward to root DAL
          return rootSimpleDAL[pickerName].apply(rootSimpleDAL, args);
        };
      });
    });

    // Write cache
    simpleDAL.notifyCache = function(cacheKey, key, value) {
      coreCache[dalName][cacheKey][key] = value;
    };
    simpleDAL.invalidateCache = function(cacheKey, arg) {
      if (cacheValidation[dalName][cacheKey]) {
        cacheValidation[dalName][cacheKey][arg] = false;
      }
    };
    simpleDAL.invalidateCache('nonmembers');
  });
}

util.inherits(CoreDAL, fileDAL.FileDAL);
