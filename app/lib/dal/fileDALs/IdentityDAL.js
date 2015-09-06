/**
 * Created by cgeek on 22/08/15.
 */

var AbstractDAL = require('./AbstractDAL');
var Q = require('q');
var _ = require('underscore');
var sha1 = require('sha1');

module.exports = IdentityDAL;

function IdentityDAL(dal) {

  "use strict";

  AbstractDAL.call(this, dal);
  var logger = require('../../../lib/logger')(dal.profile);
  var that = this;
  var treeMade;

  this.initTree = function() {
    if (!treeMade) {
      treeMade = Q.all([
        that.makeTree('identities/'),
        that.makeTree('identities/published/'),
        that.makeTree('identities/published/uid/'),
        that.makeTree('identities/published/pubkey/'),
        that.makeTree('identities/pending/')
      ]);
    }
    return treeMade;
  };

  this.excludeIdentity = function(pubkey) {
    return that.initTree()
      .then(function(){
        return that.getFromPubkey(pubkey);
      })
      .then(function(idty){
        idty.member = false;
        idty.kick = false;
        return that.saveIdentity(idty);
      });
  };

  this.savePendingIdentity = function(idty) {
    return that.initTree()
      .then(function(){
        return that.write('identities/pending/' + getIdentityID(idty), idty);
      });
  };

  this.newIdentity = function(idty, onBlockNumber) {
    return that.initTree()
      .then(function(){
        idty.currentMSN = onBlockNumber;
        idty.member = true;
        idty.wasMember = true;
        idty.kick = false;
        return that.saveIdentity(idty);
      })
      .then(function(){
        return that.savePendingIdentity(idty);
      });
  };

  this.joinIdentity = function(pubkey, onBlockNumber) {
    return that.initTree()
      .then(function(){
        return that.getFromPubkey(pubkey);
      })
      .then(function(idty){
        idty.currentMSN = onBlockNumber;
        idty.member = true;
        // TODO: previously had
        //idty.kick = false;
        return that.saveIdentity(idty);
      });
  };

  this.activeIdentity = function(pubkey, onBlockNumber) {
    return that.initTree()
      .then(function(){
        return that.getFromPubkey(pubkey);
      })
      .then(function(idty){
        idty.currentMSN = onBlockNumber;
        idty.member = true;
        idty.kick = false;
        // TODO: previously had
        //idty.kick = false;
        return that.saveIdentity(idty);
      });
  };

  this.leaveIdentity = function(pubkey, onBlockNumber) {
    return that.initTree()
      .then(function(){
        return that.getFromPubkey(pubkey);
      })
      .then(function(idty){
        idty.currentMSN = onBlockNumber;
        idty.leaving = true;
        // TODO: previously had
        //idty.member = true;
        //idty.kick = false;
        return that.saveIdentity(idty);
      });
  };

  this.getFromPubkey = function(pubkey) {
    return that.initTree()
      .then(function(){
        return that.read('identities/published/pubkey/' + pubkey + '.json');
      });
  };

  this.getFromUID = function(uid) {
    return that.initTree()
      .then(function(){
        return that.read('identities/published/uid/' + uid + '.json');
      });
  };

  this.getByHash = function(hash) {
    return that.initTree()
      .then(function(){
        return that.read('identities/pending/' + hash);
      });
  };

  this.saveIdentity = function(idty) {
    return that.initTree()
      .then(function(){
        return Q.all([
        ]);
      })
      .then(function(){
        return that.write('identities/published/pubkey/' + idty.pubkey + '.json', idty);
      })
      .then(function(){
        return that.write('identities/published/uid/' + idty.uid + '.json', idty);
      })
      .then(function(){
        return that.write('identities/pending/' + getIdentityID(idty), idty);
      });
  };

  this.getWhoIsOrWasMember = function() {
    var idties = [];
    return that.initTree()
      .then(function(){
        return that.list('identities/published/pubkey/');
      })
      .then(function(files){
        return _.pluck(files, 'file');
      })
      .then(that.reduceTo('identities/published/pubkey/', idties))
      .thenResolve(idties);
  };

  this.getPending = function() {
    var idties = [];
    return that.initTree()
      .then(function(){
        return that.list('identities/pending/');
      })
      .then(function(files){
        return _.pluck(files, 'file');
      })
      .then(that.reduceTo('identities/pending/', idties))
      .thenResolve(idties);
  };

  function getIdentityID(idty) {
    return [idty.hash].join('-');
  }
}