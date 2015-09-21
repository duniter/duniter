/**
 * Created by cgeek on 22/08/15.
 */

var AbstractDAL = require('./AbstractDAL');
var Q = require('q');
var _ = require('underscore');

module.exports = CoresDAL;

function CoresDAL(dal) {

  "use strict";

  AbstractDAL.call(this, dal);
  var logger = require('../../../lib/logger')(dal.profile);
  var that = this;
  var treeMade;

  this.initTree = function() {
    return Q.all([
      that.makeTree('cores/')
    ]);
  };

  this.addCore = function(core) {
    return that.initTree()
      .then(function(){
        return that.write('cores/' + getCoreID(core) + '.json', core, that.DEEP_WRITE);
      });
  };

  this.getCore = function(core) {
    return that.initTree()
      .then(function(){
        return that.read('cores/' + getCoreID(core) + '.json');
      });
  };

  this.removeCore = function(core) {
    return that.initTree()
      .then(function(){
        return that.remove('cores/' + getCoreID(core) + '.json', that.RECURSIVE)
          .fail(function(){
          });
      });
  };

  this.getCores = function() {
    var cores = [];
    return that.initTree()
      .then(function(){
        return that.list('cores/')
          .then(function(files){
            return _.pluck(files, 'file');
          })
          .then(that.reduceTo('cores/', cores))
          .thenResolve(cores);
      });
  };

  function getCoreID(core) {
    return [core.forkPointNumber, core.forkPointHash].join('-');
  }
}