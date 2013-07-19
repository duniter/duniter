var sha1 = require('sha1');
var async = require('async');

function Merkle(strings) {

  this.leaves = [];
  this.depth = 0;
  this.levels = [];

  // PUBLIC
  this.feed = function(anyData) {
    if(anyData && anyData.match(/^[\w\d]{40}$/)){
      this.leaves.push(anyData.toUpperCase());
    }
    else{
      this.leaves.push(sha1(anyData).toUpperCase());
    }
    return this;
  };

  this.process = function(done) {
    var obj = this;
    async.waterfall([
      function(callback){
        // Compute tree depth
        var pow = 0;
        while(Math.pow(2, pow) < obj.leaves.length){
          pow++;
        }
        obj.depth = pow;
        callback(null, obj.depth);
      },
      function(depth, callback){
        // Compute the nodes of each level
        var levels = [];
        for (var i = 0; i < depth; i++) {
          levels.push([]);
        }
        levels[depth] = obj.leaves;
        for (var j = depth-1; j >= 0; j--) {
          levels[j] = getNodes(levels[j+1]);
        }
        obj.levels = levels;
        callback();
      }
    ], function (err) {
      done(err, obj.levels[0]);
    });
  };

  this.getRoot = function() {
    return this.levels[0][0];
  };

  // PRIVATE
  function getNodes(leaves) {
    var remainder = leaves.length % 2;
    var nodes = [];
    for (var i = 0; i < leaves.length - 1; i = i + 2) {
      nodes[i/2] = sha1(leaves[i] + leaves[i+1]).toUpperCase();
    }
    if(remainder === 1){
      nodes[((leaves.length-remainder)/2)] = leaves[leaves.length - 1];
    }
    return nodes;
  }

  // INIT
  for (var i = 0; i < strings.length; i++) {
    this.feed(strings[i]);
  }
}

module.exports = function (strings) {
  return new Merkle(strings);
};