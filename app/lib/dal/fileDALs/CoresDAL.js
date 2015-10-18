/**
 * Created by cgeek on 22/08/15.
 */

var Q = require('q');

module.exports = CoresDAL;

function CoresDAL(rootPath, qioFS, parentCore, localDAL, AbstractStorage) {

  "use strict";

  var that = this;

  AbstractStorage.call(this, rootPath, qioFS, parentCore, localDAL);

  this.init = () => Q.all([
    that.coreFS.makeTree('cores/')
  ]);

  this.addCore = (core) => that.coreFS.writeJSONDeep('cores/' + getCoreID(core) + '.json', core);

  this.getCore = (core) => that.coreFS.readJSON('cores/' + getCoreID(core) + '.json');

  this.removeCore = (core) => that.coreFS.removeDeep('cores/' + getCoreID(core) + '.json');

  this.getCores = () => that.coreFS.listJSON('cores/');

  function getCoreID(core) {
    return [core.forkPointNumber, core.forkPointHash].join('-');
  }
}