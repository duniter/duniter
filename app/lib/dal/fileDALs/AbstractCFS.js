/**
 * Created by cgeek on 22/08/15.
 */

var cfs = require('../../cfs');

module.exports = AbstractCFS;

function AbstractCFS(rootPath, qioFS, parentDAL, localDAL) {

  "use strict";

  this.coreFS = cfs(rootPath, qioFS, parentDAL);
  this.dal = localDAL;
}
