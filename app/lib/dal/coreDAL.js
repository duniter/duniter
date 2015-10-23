"use strict";

var fileDAL = require('./fileDAL');
var util = require('util');
var _ = require('underscore');

module.exports = function(profile, home, coreName, myFS, rootDAL, levelUpInstance, core, loki) {
  return new CoreDAL(profile, home, coreName, myFS, rootDAL, levelUpInstance, core, loki);
};

function CoreDAL(profile, home, coreName, myFS, rootDAL, levelUpInstance, core, loki) {

  let that = this;

  fileDAL.FileDAL.call(this, profile, home, '/branches/' + coreName, myFS, rootDAL, levelUpInstance, coreName, core, loki);

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
