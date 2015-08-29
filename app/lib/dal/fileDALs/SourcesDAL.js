/**
 * Created by cgeek on 22/08/15.
 */

var AbstractDAL = require('./AbstractDAL');
var Q = require('q');
var _ = require('underscore');
var sha1 = require('sha1');

module.exports = SourcesDAL;

function SourcesDAL(dal) {

  "use strict";

  AbstractDAL.call(this, dal);
  var logger = require('../../../lib/logger')(dal.profile);
  var that = this;
  var treeMade;

  this.initTree = function() {
    if (!treeMade) {
      treeMade = Q.all([
        that.makeTree('sources/'),
        that.makeTree('sources/consumed/'),
        that.makeTree('sources/available/')
      ]);
    }
    return treeMade;
  };

  this.getAvailableForPubkey = function(pubkey) {
    var sources = [];
    return that.initTree()
      .then(function(){
        return that.list('sources/available/' + pubkey + '/');
      })
      .then(function(files){
        return _.pluck(files, 'file');
      })
      .then(that.reduceTo('sources/available/' + pubkey + '/', sources))
      .thenResolve(sources)
      .fail(function(err){
        throw err;
      });
  };

  this.getAvailableSource = function(pubkey, type, number, fingerprint, amount) {
    return that.initTree()
      .then(function(){
        return that.read('sources/available/' + pubkey + '/' + getSourceID(type, number, fingerprint, amount) + '.json');
      });
  };

  this.getSource = function(pubkey, type, number) {
    return that.initTree()
      .then(function(){
        return that.getAvailableForPubkey(pubkey)
          .then(function(sources){
            return _.findWhere(sources, { type: type, number: number });
          });
      });
  };

  this.isAvailableSource = function(pubkey, type, number, fingerprint, amount) {
    return that.getAvailableSource(pubkey, type, number, fingerprint, amount)
      .thenResolve(true)
      .fail(function(){
        return false;
      });
  };

  this.consumeSource = function(pubkey, type, number, fingerprint, amount) {
    return that.initTree()
      .then(function(){
        return that.remove('sources/available/' + pubkey + '/' + getSourceID(type, number, fingerprint, amount) + '.json', that.RECURSIVE)
          .fail(function(err){
            throw err;
          });
      })
      .then(function(){
        that.addSource('consumed', pubkey, type, number, fingerprint, amount);
      });
  };

  this.addSource = function(state, pubkey, type, number, fingerprint, amount) {
    return that.initTree()
      .then(function(){
        return that.makeTree('sources/' + state + '/' + pubkey + '/');
      })
      .then(function(){
        return that.write('sources/' + state + '/' + pubkey + '/' + getSourceID(type, number, fingerprint, amount) + '.json', {
          pubkey: pubkey,
          type: type,
          number: number,
          fingerprint: fingerprint,
          amount: amount
        });
      });
  };

  function getSourceID(type, number, fingerprint, amount) {
    return [type, number, fingerprint, amount].join('-');
  }
}