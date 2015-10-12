/**
 * Created by cgeek on 22/08/15.
 */

var AbstractCFS = require('./AbstractCFS');
var AbstractCacheable = require('./AbstractCacheable');
var Q = require('q');
var _ = require('underscore');
var co = require('co');
var sha1 = require('sha1');

module.exports = IdentityDAL;

function IdentityDAL(rootPath, qioFS, parentCore, localDAL, rootDAL, considerCacheInvalidateByDefault) {

  "use strict";

  var that = this;

  // CFS facilities
  AbstractCFS.call(this, rootPath, qioFS, parentCore, localDAL);

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

  this.init = () => {
    return co(function *() {
      yield [
        that.coreFS.makeTree('identities/'),
        that.coreFS.makeTree('identities/published/'),
        that.coreFS.makeTree('identities/published/uid/'),
        that.coreFS.makeTree('identities/published/pubkey/'),
        that.coreFS.makeTree('identities/hash/'),
        that.coreFS.makeTree('identities/pending/')
      ];
      if (that.dal.name == 'fileDal') {
        // TODO: not really proud of that, has to be refactored for more generic code
        var publishedByPubkey = yield that.coreFS.listJSON('identities/published/pubkey/');
        for (let i = 0; i < publishedByPubkey.length; i++) {
          let idty = publishedByPubkey[i];
          cacheByPubkey[idty.pubkey] = idty;
          cacheByHash[getIdentityID(idty)] = idty;
        }
        var publishedByUID = yield that.coreFS.listJSON('identities/published/uid/');
        for (let i = 0; i < publishedByUID.length; i++) {
          let idty = publishedByUID[i];
          cacheByUID[idty.uid] = idty;
        }
        var publishedByHash = yield that.coreFS.listJSON('identities/hash/');
        for (let i = 0; i < publishedByHash.length; i++) {
          let idty = publishedByHash[i];
          cacheByHash[getIdentityID(idty)] = idty;
        }
      }
    });
  };

  this.excludeIdentity = (pubkey) => {
    return co(function *() {
      var idty = yield that.getFromPubkey(pubkey);
      idty.member = false;
      idty.kick = false;
      idty.leaving = false;
      return that.saveIdentity(idty);
    });
  };

  this.savePendingIdentity = function(idty) {
    return co(function *() {
      yield that.coreFS.writeJSON('identities/pending/' + getIdentityID(idty), idty);
      yield that.coreFS.writeJSON('identities/hash/' + getIdentityID(idty), idty);
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
    idty.currentMSN = onBlockNumber;
    idty.member = true;
    idty.wasMember = true;
    idty.kick = false;
    return that.saveIdentity(idty);
  };

  this.joinIdentity = (pubkey, onBlockNumber) => {
    return co(function *() {
      var idty = yield that.getFromPubkey(pubkey);
      idty.currentMSN = onBlockNumber;
      idty.member = true;
      idty.leaving = false;
      // TODO: previously had
      //idty.kick = false;
      return that.saveIdentity(idty);
    });
  };

  this.activeIdentity = (pubkey, onBlockNumber) => {
    return co(function *() {
      var idty = yield that.getFromPubkey(pubkey);
      idty.currentMSN = onBlockNumber;
      idty.member = true;
      idty.kick = false;
      idty.leaving = false;
      // TODO: previously had
      //idty.kick = false;
      return that.saveIdentity(idty);
    });
  };

  this.leaveIdentity = (pubkey, onBlockNumber) => {
    return co(function *() {
      var idty = yield that.getFromPubkey(pubkey);
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
    return that.coreFS.readJSON('identities/published/pubkey/' + pubkey + '.json');
  };

  this.getFromUID = function(uid) {
    // TODO: not really proud of that, has to be refactored for more generic code
    if (that.dal.name == 'fileDal') {
      if (cacheByUID[uid]) {
        return Q(cacheByUID[uid]);
      }
    }
    return that.coreFS.readJSON('identities/published/uid/' + uid + '.json');
  };

  this.getByHash = function(hash) {
    // TODO: not really proud of that, has to be refactored for more generic code
    if (that.dal.name == 'fileDal') {
      if (cacheByHash[hash]) {
        return Q(cacheByHash[hash]);
      }
    }
    return that.coreFS.readJSON('identities/hash/' + hash);
  };

  this.saveIdentity = function(idty) {
    return co(function *() {
      yield that.coreFS.writeJSON('identities/published/pubkey/' + idty.pubkey + '.json', idty);
      yield that.coreFS.writeJSON('identities/published/uid/' + idty.uid + '.json', idty);
      yield that.coreFS.writeJSON('identities/hash/' + getIdentityID(idty), idty);
      yield that.coreFS.remove('identities/pending/' + getIdentityID(idty)).catch(() => null);
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
    return co(function *() {
      // TODO: not really proud of that, has to be refactored for more generic code
      if (that.dal.name == 'fileDal') {
        return _.values(cacheByPubkey);
      }
      return that.coreFS.listJSON('identities/published/pubkey/');
    });
  };

  this.getPendingIdentities = function() {
    return co(function *() {
      var idties = [];
      var tmpIdities = yield that.coreFS.listJSON('identities/pending/');
      for (var i = 0; i < tmpIdities.length; i++) {
        var idty = tmpIdities[i];
        var foundMember = yield that.getFromPubkey(idty.pubkey);
        if (!foundMember) {
          idties.push(idty);
        }
      }
      return idties;
    });
  };

  this.listLocalPending = () => that.coreFS.listJSONLocal('identities/pending/');

  function getIdentityID(idty) {
    return [idty.hash].join('-');
  }

  // Cache facilities
  AbstractCacheable.call(this, 'idtyDAL', rootDAL, considerCacheInvalidateByDefault);
}