/**
 * Created by cgeek on 22/08/15.
 */


module.exports = AbstractDAL;

function AbstractDAL(dal) {

  "use strict";

  var that = this;
  this.dal = dal;

  var existsFileFunc, readFileFunc, writeFileFunc, removeFileFunc, listFilesFunc, makeTreeFunc;

  this.setExists = function(f) {
    existsFileFunc = f;
  };

  this.setList = function(f) {
    listFilesFunc = f;
  };

  this.setRead = function(f) {
    readFileFunc = f;
  };

  this.setWrite = function(f) {
    writeFileFunc = f;
  };

  this.setRemove = function(f) {
    removeFileFunc = f;
  };

  this.setMakeTree = function(f) {
    makeTreeFunc = f;
  };

  this.list = function(path) {
    return listFilesFunc(path);
  };

  this.exists = function(path) {
    return existsFileFunc(path);
  };

  this.read = function(path) {
    return readFileFunc(path);
  };

  this.write = function(path, what) {
    return writeFileFunc(path, what);
  };

  this.remove = function(path) {
    return removeFileFunc(path);
  };

  this.makeTree = function(path) {
    return makeTreeFunc(path);
  };
}