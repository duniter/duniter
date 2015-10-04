/**
 * Created by cgeek on 22/08/15.
 */

var cfs = require('../../cfs');

module.exports = AbstractDAL;

function AbstractDAL(rootPath, qioFS, parentCore) {

  "use strict";

  this.coreFS = cfs(rootPath, qioFS, parentCore);

  this.changeParentCore = (newParent) => this.coreFS.changeParent(newParent);
}