"use strict";
var _ = require('underscore');
var merkle = require('merkle');

module.exports = Merkle;

function Merkle(json) {

  var that = this;

  _(json || {}).keys().forEach(function(key) {
    var value = json[key];
    if (key == "number") {
      value = parseInt(value);
    }
    that[key] = value;
  });

  this.initialize = function (leaves) {
    var tree = merkle(leaves, 'sha1').process();
    this.depth = tree.depth();
    this.nodes = tree.nodes();
    this.levels = [];
    for (var i = 0; i < tree.levels(); i++) {
      this.levels[i] = tree.level(i);
    }
    return this;
  };

  this.remove = function (leaf) {
    // If leaf IS present
    if(~this.levels[this.depth].indexOf(leaf)){
      var leaves = this.leaves();
      var index = leaves.indexOf(leaf);
      if(~index){
        // Replacement: remove previous hash
        leaves.splice(index, 1);
      }
      leaves.sort();
      this.initialize(leaves);
    }
  };

  this.removeMany = function (leaves) {
    leaves.forEach(function(leaf){
      // If leaf IS present
      if(~this.levels[this.depth].indexOf(leaf)){
        var leaves = this.leaves();
        var index = leaves.indexOf(leaf);
        if(~index){
          // Replacement: remove previous hash
          leaves.splice(index, 1);
        }
      }
    });
    leaves.sort();
    this.initialize(leaves);
  };

  this.push = function (leaf, previous) {
    // If leaf is not present
    if(this.levels[this.depth].indexOf(leaf) == -1){
      var leaves = this.leaves();
      // Update or replacement ?
      if(previous && leaf != previous){
        var index = leaves.indexOf(previous);
        if(~index){
          // Replacement: remove previous hash
          leaves.splice(index, 1);
        }
      }
      leaves.push(leaf);
      leaves.sort();
      this.initialize(leaves);
    }
  };

  this.pushMany = function (leaves) {
    var that = this;
    leaves.forEach(function (leaf) {
      // If leaf is not present
      if(that.levels[that.depth].indexOf(leaf) == -1){
        that.leaves().push(leaf);
      }
    });
    leaves.sort();
    this.initialize(leaves);
  };

  this.root = function () {
    return this.levels.length > 0 ? this.levels[0][0] : '';
  };

  this.leaves = function () {
    return this.levels[this.depth];
  };

  this.count = function () {
    return this.leaves().length;
  };
}
