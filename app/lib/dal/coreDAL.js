"use strict";

var fileDAL = require('./fileDAL');
var util = require('util');
var _ = require('underscore');

module.exports = function(profile, blockNumber, blockHash, myFS, rootDAL) {
  return new CoreDAL(profile, blockNumber, blockHash, myFS, rootDAL);
};

function CoreDAL(profile, blockNumber, blockHash, myFS, rootDAL, considerCacheInvalidateByDefault) {

  var that = this;
  var coreName = [blockNumber, blockHash].join('-');

  fileDAL.FileDAL.call(this, profile, 'branches/' + coreName, myFS, rootDAL, considerCacheInvalidateByDefault);

  this.name = ['coreDal', blockNumber, blockHash].join('_');

  this.setRootDAL = function(dal) {
    rootDAL = dal;
    _.keys(that.newDals).map((dalName) => {
      var localDal = that.newDals[dalName];
      var parentDal = dal.newDals[dalName];
      localDal.changeParentCore(parentDal.coreFS);
    });
  };
}

util.inherits(CoreDAL, fileDAL.FileDAL);
