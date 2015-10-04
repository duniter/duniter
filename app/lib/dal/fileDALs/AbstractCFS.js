/**
 * Created by cgeek on 22/08/15.
 */

var cfs = require('../../cfs');

module.exports = AbstractDAL;

function AbstractDAL(rootPath, qioFS, parentDAL, localDAL) {

  "use strict";

  this.coreFS = cfs(rootPath, qioFS, parentDAL);
  this.dal = localDAL;

  this.changeParentCore = (newParent) => this.coreFS.changeParent(newParent);
}