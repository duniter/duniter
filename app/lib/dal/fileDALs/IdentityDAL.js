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
  var cacheByPubkey = {};
  var cacheByUID = {};
  var cacheByHash = {};

  this.cached = {
    'pubkey': ['getFromPubkey'],
    'uid': ['getFromUID'],
    'hash': ['getByHash']
  };

  this.cachedLists = {
    'members': ['getWhoIsOrWasMember'],
    'nonmembers': ['getPendingIdentities']
  };

  this.initTree = function() {
    if (!treeMade) {
      treeMade = Q.all([
        that.makeTree('identities/'),
        that.makeTree('identities/published/'),
        that.makeTree('identities/published/uid/'),
        that.makeTree('identities/published/pubkey/'),
        that.makeTree('identities/hash/'),
        that.makeTree('identities/pending/')
      ])
        .then(function(){
          // TODO: not really proud of that, has to be refactored for more generic code
          if (that.dal.name == 'fileDal') {
            // Load in cache
            return Q.all([
              that.list('identities/published/pubkey/')
                .then(function (files) {
                  return Q.all(files.map(function (file) {
                    var pubkey = file.file;
                    return that.read('identities/published/pubkey/' + pubkey)
                      .then(function (idty) {
                        cacheByPubkey[idty.pubkey] = idty;
                        cacheByHash[getIdentityID(idty)] = idty;
                      });
                  }));
                }),
              that.list('identities/published/uid/')
                .then(function (files) {
                  return Q.all(files.map(function (file) {
                    var uid = file.file;
                    return that.read('identities/published/uid/' + uid)
                      .then(function (idty) {
                        cacheByUID[idty.uid] = idty;
                      });
                  }));
                }),
              that.list('identities/hash/')
                .then(function (files) {
                  return Q.all(files.map(function (file) {
                    return that.read('identities/hash/' + file.file)
                      .then(function (idty) {
                        cacheByHash[getIdentityID(idty)] = idty;
                      });
                  }));
                })
            ]);
          }
        });
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
      })
      .tap(function() {
        // TODO: not really proud of that, has to be refactored for more generic code
        if (that.dal.name == 'fileDal') {
          cacheByHash[getIdentityID(idty)] = idty;
        }
        else {
          that.notifyCache('hash', getIdentityID(idty), idty);
          that.invalidateCache('nonmembers');
        }
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
    // TODO: not really proud of that, has to be refactored for more generic code
    if (that.dal.name == 'fileDal') {
      if (cacheByPubkey[pubkey]) {
        return Q(cacheByPubkey[pubkey]);
      }
    }
    return that.initTree()
      .then(function(){
        return that.read('identities/published/pubkey/' + pubkey + '.json');
      });
  };

  this.getFromUID = function(uid) {
    // TODO: not really proud of that, has to be refactored for more generic code
    if (that.dal.name == 'fileDal') {
      if (cacheByUID[uid]) {
        return Q(cacheByUID[uid]);
      }
    }
    return that.initTree()
      .then(function(){
        return that.read('identities/published/uid/' + uid + '.json');
      });
  };

  this.getByHash = function(hash) {
    // TODO: not really proud of that, has to be refactored for more generic code
    if (that.dal.name == 'fileDal') {
      if (cacheByHash[hash]) {
        return Q(cacheByHash[hash]);
      }
    }
    return that.initTree()
      .then(function(){
        return that.read('identities/hash/' + hash);
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
        return that.write('identities/hash/' + getIdentityID(idty), idty);
      })
      .then(function(){
        return that.remove('identities/pending/' + getIdentityID(idty))
          .fail(function() {
            // Silent error
          });
      })
      .tap(function() {
        // TODO: not really proud of that, has to be refactored for more generic code
        if (that.dal.name == 'fileDal') {
          cacheByPubkey[idty.pubkey] = idty;
          cacheByUID[idty.uid] = idty;
          cacheByHash[getIdentityID(idty)] = idty;
        }
        else {
          that.notifyCache('pubkey', idty.pubkey, idty);
          that.notifyCache('uid', idty.uid, idty);
          that.notifyCache('hash', getIdentityID(idty), idty);
          that.invalidateCache('members');
          that.invalidateCache('nonmembers');
        }
      });
  };

  this.getWhoIsOrWasMember = function() {
    // TODO: not really proud of that, has to be refactored for more generic code
    if (that.dal.name == 'fileDal') {
      return Q(_.values(cacheByPubkey));
    }
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

  this.getPendingIdentities = function() {
    var idties = [], tmpIdities = [];
    return that.initTree()
      .then(function(){
        return that.list('identities/pending/');
      })
      .then(function(files){
        return _.pluck(files, 'file');
      })
      .then(that.reduceTo('identities/pending/', tmpIdities))
      .then(function(){
        return Q.all(tmpIdities.map(function(idty) {
          return that.getFromPubkey(idty.pubkey)
            .fail(function(){
              idties.push(idty);
            });
        }));
      })
      .thenResolve(idties);
  };

  this.listLocalPending = function() {
    var idties = [];
    return that.initTree()
      .then(function(){
        return that.list('identities/pending/', that.LOCAL_LEVEL);
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