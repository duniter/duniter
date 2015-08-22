/**
 * Created by cgeek on 22/08/15.
 */

var AbstractDAL = require('./AbstractDAL');
var _= require('underscore');

module.exports = GlobalDAL;

function GlobalDAL(profile) {

  "use strict";

  AbstractDAL.call(this);
  var logger = require('../../../lib/logger')(profile);
  var that = this;

  this.getGlobal = function() {
    return that.read('global.json')
      .fail(function(){
        return { currentNumber: -1 };
      });
  };

  this.setLastSavedBlockFile = function(last) {
    return that.getGlobal()
      .then(function(global) {
        global.lastSavedBlockFile = Math.max(global.lastSavedBlockFile || 0, last);
        return that.saveGlobal(global);
      });
  };

  this.setCurrentNumber = function(currentNumber) {
    return that.getGlobal()
      .then(function(global) {
        global.currentNumber = currentNumber;
        return that.saveGlobal(global);
      });
  };

  this.saveGlobal = function(global) {
    return that.write('global.json', global);
  };
}