/**
 * Created by cgeek on 22/08/15.
 */


module.exports = AbstractDAL;

function AbstractDAL() {

  "use strict";

  var readFileFunc, writeFileFunc;

  this.setRead = function(f) {
    readFileFunc = f;
  };

  this.setWrite = function(f) {
    writeFileFunc = f;
  };

  this.read = function(path) {
    return readFileFunc(path);
  };

  this.write = function(path, what) {
    return writeFileFunc(path, what);
  };
}