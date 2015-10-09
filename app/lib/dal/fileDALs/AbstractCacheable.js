/**
 * Created by cgeek on 22/08/15.
 */

var _ = require('underscore');
var Q = require('q');

module.exports = AbstractCacheable;

function AbstractCacheable(dalName, rootDAL, considerCacheInvalidateByDefault) {

  "use strict";

  var that = this;

  if (rootDAL) {
    var coreCache = {}, cacheValidation = {};
    var rootSimpleDAL = rootDAL[dalName];

    // Read cache
    (_.keys(that.cached) || []).forEach(function(cacheKey){

      coreCache[cacheKey] = {};

      that.cached[cacheKey].forEach(function(pickerName) {

        // Decorates function with cache
        //var originalFunc = simpleDAL[pickerName];
        that[pickerName] = function() {
          var args = Array.prototype.slice.call(arguments);
          // Check cache
          if (coreCache[cacheKey][args[0]]) {
            return Q(coreCache[cacheKey][args[0]]);
          }
          // Otherwise call the root dal function
          return rootSimpleDAL[pickerName].apply(rootSimpleDAL, args);
        };
      });
    });

    // List cache
    (_.keys(that.cachedLists) || []).forEach(function(cacheKey){

      coreCache[cacheKey] = {};
      cacheValidation[cacheKey] = {};

      that.cachedLists[cacheKey].forEach(function(pickerName) {

        // Decorates function with cache
        var originalFunc = that[pickerName];
        that[pickerName] = function() {
          var args = Array.prototype.slice.call(arguments);
          // Check cache
          if (coreCache[cacheKey][args[0]]) {
            return Q(coreCache[cacheKey][args[0]]);
          }
          // Otherwise check if the cache has been invalidated (due to some writing).
          if (cacheValidation[cacheKey][args[0]] === false || (cacheValidation[cacheKey][args[0]] === undefined && considerCacheInvalidateByDefault)) {
            // If invalidated -> recompute the listing values
            return originalFunc.apply(that, args)
              .then(function(result){
                cacheValidation[cacheKey][args[0]] = true;
                coreCache[cacheKey][args[0]] = result;
                return result;
              });
          }
          // Else -> forward to root DAL
          return rootSimpleDAL[pickerName].apply(rootSimpleDAL, args);
        };
      });
    });

    // Write cache
    that.notifyCache = function(cacheKey, key, value) {
      coreCache[cacheKey][key] = value;
    };
    that.invalidateCache = function(cacheKey, arg) {
      if (cacheValidation[cacheKey]) {
        cacheValidation[cacheKey][arg] = false;
      }
    };
    that.invalidateCache('nonmembers');
  }
}