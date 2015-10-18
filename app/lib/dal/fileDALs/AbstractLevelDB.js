/**
 * Created by cgeek on 16/10/15.
 */

var leveldb = require('./../../leveldb');

module.exports = AbstractLevelDB;

function AbstractLevelDB(rootPath, db, parentDAL, localDAL) {

  "use strict";

  this.coreFS = leveldb(rootPath, db, parentDAL);
  this.dal = localDAL;

  this.changeParentCore = (newParent) => this.coreFS.changeParent(newParent);
}