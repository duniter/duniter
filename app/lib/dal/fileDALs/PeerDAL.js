/**
 * Created by cgeek on 22/08/15.
 */

var AbstractDAL = require('./AbstractDAL');
var Q = require('q');
var _ = require('underscore');
var sha1 = require('sha1');

module.exports = PeerDAL;

function PeerDAL(dal) {

  "use strict";

  AbstractDAL.call(this, dal);
  var logger = require('../../../lib/logger')(dal.profile);
  var that = this;
  var treeMade;

  this.initTree = function() {
    if (!treeMade) {
      treeMade = Q.all([
        that.makeTree('peers/')
      ]);
    }
    return treeMade;
  };

  this.listAll = function() {
    var peers = [];
    return that.initTree()
      .then(function(){
        return that.list('peers/');
      })
      .then(function(files){
        return _.pluck(files, 'file');
      })
      .then(that.reduceTo('peers/', peers))
      .thenResolve(peers);
  };

  this.getPeer = function(pubkey) {
    return that.initTree()
      .then(function(){
        return that.read('peers/' + pubkey + '.json');
      });
  };

  this.savePeer = function(peer) {
    return that.initTree()
      .then(function(){
        return that.write('peers/' + peer.pubkey + '.json', peer);
      });
  };
}