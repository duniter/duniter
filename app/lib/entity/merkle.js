"use strict";
const _ = require('underscore');
const merkle = require('merkle');

module.exports = Merkle;

function Merkle(json) {

  _(json || {}).keys().forEach((key) => {
    let value = json[key];
    if (key == "number") {
      value = parseInt(value);
    }
    this[key] = value;
  });

  this.initialize = (leaves) => {
    const tree = merkle('sha256').sync(leaves);
    this.depth = tree.depth();
    this.nodes = tree.nodes();
    this.levels = [];
    for (let i = 0; i < tree.levels(); i++) {
      this.levels[i] = tree.level(i);
    }
    return this;
  };

  this.remove = (leaf) => {
    // If leaf IS present
    if(~this.levels[this.depth].indexOf(leaf)){
      const leaves = this.leaves();
      const index = leaves.indexOf(leaf);
      if(~index){
        // Replacement: remove previous hash
        leaves.splice(index, 1);
      }
      leaves.sort();
      this.initialize(leaves);
    }
  };

  this.removeMany = (leaves) => {
    leaves.forEach((leaf) => {
      // If leaf IS present
      if(~this.levels[this.depth].indexOf(leaf)){
        const theLeaves = this.leaves();
        const index = theLeaves.indexOf(leaf);
        if(~index){
          // Replacement: remove previous hash
          theLeaves.splice(index, 1);
        }
      }
    });
    leaves.sort();
    this.initialize(leaves);
  };

  this.push = (leaf, previous) => {
    // If leaf is not present
    if(this.levels[this.depth].indexOf(leaf) == -1){
      const leaves = this.leaves();
      // Update or replacement ?
      if(previous && leaf != previous){
        const index = leaves.indexOf(previous);
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

  this.pushMany = (leaves) => {
    leaves.forEach((leaf) => {
      // If leaf is not present
      if(this.levels[this.depth].indexOf(leaf) == -1){
        this.leaves().push(leaf);
      }
    });
    leaves.sort();
    this.initialize(leaves);
  };

  this.root = () => this.levels.length > 0 ? this.levels[0][0] : '';

  this.leaves = () => this.levels[this.depth];

  this.count = () => this.leaves().length;
}
