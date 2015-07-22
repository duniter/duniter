"use strict";

var _  = require('underscore');
var Q  = require('q');
var rp = require('request-promise');

module.exports = function makeBlockAndPost(fromBlock, toBlock, fromServer, toServer) {
  // Sync blocks
  return _.range(fromBlock, toBlock + 1).reduce(function(p, number) {
    return p.then(function(){
      return Q.Promise(function(resolve, reject){
        return rp('http://' + fromServer.conf.ipv4 + ':' + fromServer.conf.port + '/blockchain/block/' + number, { json: true })
          .catch(function(err){
            reject(err);
          })
          .then(function(json){
            return toServer.singleWritePromise(_.extend(json, { documentType: 'block' }))
              .then(function(){
                resolve();
              })
              .catch(function(err){
                reject(err);
              });
          });
      });
    });
  }, Q());
};
