/**
 * Created by cgeek on 22/08/15.
 */

var AbstractDAL = require('./AbstractDAL');
var Q = require('q');
var _ = require('underscore');
var sha1 = require('sha1');

module.exports = MerkleDAL;

function MerkleDAL(dal) {

  "use strict";

  AbstractDAL.call(this, dal);
  var logger = require('../../../lib/logger')(dal.profile);
  var that = this;
  var treeMade;

  this.initTree = function() {
    if (!treeMade) {
      treeMade = Q.all([
      ]);
    }
    return treeMade;
  };

  this.pushMerkle = function(treeName, leaves) {
    return that.getMerkles()
      .then(function(merkles){
        merkles = _.reject(merkles, function(m){ return m.tree == treeName; });
        merkles.push({
          tree: treeName,
          leaves: leaves
        });
        return that.write('merkles.json', merkles);
      });
  };

  this.getLeaves = function(name) {
    return that.getMerkles()
      .then(function(merkles){
        return (_.where(merkles, { tree: name })[0] || {}).leaves || [];
      });
  };

  this.getMerkles = function() {
    return that.initTree()
      .then(function(){
        return that.read('merkles.json')
          .fail(function() {
            return [];
          });
      });
  };
}