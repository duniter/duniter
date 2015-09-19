"use strict";

var vucoin = require('vucoin');
var Q = require('q');

module.exports = function(host, port) {
  return new VucoinPromise(host, port);
};

function VucoinPromise(host, port) {

  var nodeP = Q.Promise(function(resolve, reject){
    vucoin(host, port, function(err, node) {
      if (err) {
        return reject(err);
      }
      return resolve(node);
    });
  });

  function vucoinMethodToPromise(methodName) {
    return function() {
      var args = Array.prototype.slice.call(arguments);
      return nodeP
        .then(function(node){
          var sp = methodName.split('.');
          var method = sp.reduce(function(object, memberName) {
            return object[memberName];
          }, node);
          var methodP = Q.nbind(method, node);
          return methodP.apply(null, args);
        });
    };
  }

  this.getBlock = vucoinMethodToPromise('blockchain.block');
  this.getCurrent = vucoinMethodToPromise('blockchain.current');
  this.getPeer = vucoinMethodToPromise('network.peering.get');
  this.getPeers = vucoinMethodToPromise('network.peering.peers.get');
  this.postPeer = vucoinMethodToPromise('network.peering.peers.post');
}
