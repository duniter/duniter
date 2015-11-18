/**
 * Created by cgeek on 22/08/15.
 */

var Q = require('q');
var _ = require('underscore');
var co = require('co');
var AbstractLoki = require('./AbstractLoki');

module.exports = IdentityDAL;

function IdentityDAL(loki) {

  "use strict";

  let collection = loki.getCollection('identities') || loki.addCollection('identities', { indices: ['uid', 'pubkey', 'timestamp', 'member', 'written'] });
  let that = this;
  AbstractLoki.call(this, collection);

  this.idKeys = ['pubkey', 'uid', 'hash'];
  this.propsToSave = [
    'revoked',
    'currentMSN',
    'memberships',
    'time',
    'member',
    'kick',
    'leaving',
    'wasMember',
    'pubkey',
    'uid',
    'sig',
    'hash',
    'written'
  ];

  this.init = () => null;

  this.excludeIdentity = (pubkey) => {
    return co(function *() {
      var idty = yield that.getFromPubkey(pubkey);
      idty.member = false;
      idty.kick = false;
      idty.leaving = false;
      return that.saveIdentity(idty);
    });
  };

  this.unacceptIdentity = (pubkey) => {
    return co(function *() {
      var idty = yield that.getFromPubkey(pubkey);
      idty.currentMSN = -1;
      idty.memberships = [];
      idty.written = false;
      idty.wasMember = false;
      idty.member = false;
      idty.kick = false;
      idty.leaving = false;
      return that.saveIdentity(idty);
    });
  };

  this.unJoinIdentity = (ms) => {
    return co(function *() {
      var idty = yield that.getFromPubkey(ms.issuer);
      idty.memberships.pop();
      idty.currentMSN = idty.memberships[idty.memberships.length - 1];
      idty.member = false;
      return that.saveIdentity(idty);
    });
  };

  this.unRenewIdentity = (pubkey) => {
    return co(function *() {
      var idty = yield that.getFromPubkey(pubkey);
      idty.memberships.pop();
      idty.currentMSN = idty.memberships[idty.memberships.length - 1];
      return that.saveIdentity(idty);
    });
  };

  this.unLeaveIdentity = (pubkey) => {
    return co(function *() {
      var idty = yield that.getFromPubkey(pubkey);
      idty.memberships.pop();
      idty.currentMSN = idty.memberships[idty.memberships.length - 1];
      idty.leaving = false;
      return that.saveIdentity(idty);
    });
  };

  this.unExcludeIdentity = (pubkey) => {
    return co(function *() {
      var idty = yield that.getFromPubkey(pubkey);
      idty.memberships.pop();
      idty.currentMSN = idty.memberships[idty.memberships.length - 1];
      idty.leaving = false;
      return that.saveIdentity(idty);
    });
  };

  this.newIdentity = function(idty, onBlockNumber) {
    idty.currentMSN = onBlockNumber;
    idty.memberships = [onBlockNumber];
    idty.member = true;
    idty.wasMember = true;
    idty.kick = false;
    idty.written = true;
    return that.saveIdentity(idty);
  };

  this.joinIdentity = (pubkey, onBlockNumber) => {
    return co(function *() {
      var idty = yield that.getFromPubkey(pubkey);
      idty.memberships.push(onBlockNumber);
      idty.currentMSN = onBlockNumber;
      idty.member = true;
      idty.wasMember = true;
      idty.leaving = false;
      // TODO: previously had
      //idty.kick = false;
      return that.saveIdentity(idty);
    });
  };

  this.activeIdentity = (pubkey, onBlockNumber) => {
    return co(function *() {
      var idty = yield that.getFromPubkey(pubkey);
      idty.memberships.push(onBlockNumber);
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
      idty.memberships.push(onBlockNumber);
      idty.currentMSN = onBlockNumber;
      idty.leaving = true;
      // TODO: previously had
      //idty.member = true;
      //idty.kick = false;
      return that.saveIdentity(idty);
    });
  };

  this.getFromPubkey = function(pubkey) {
    return that.lokiFindOne({
      pubkey: pubkey
    }, {
      wasMember: true
    }, that.IMMUTABLE_FIELDS);
  };

  this.getFromUID = function(uid) {
    return that.lokiFindOne({
      uid: uid
    }, {
      wasMember: true
    }, that.IMMUTABLE_FIELDS);
  };

  this.getByHash = function(hash) {
    return that.lokiFindOne({
      hash: hash
    });
  };

  this.saveIdentity = (idty) => this.lokiSave(idty);

  this.getWhoIsOrWasMember = function() {
    return that.lokiFindInAll({
      wasMember: true
    });
  };

  this.getPendingIdentities = function() {
    return that.lokiFindInAll({
      wasMember: false
    });
  };

  this.listLocalPending = () => Q([]);

  this.searchThoseMatching = function(search) {
    return that.lokiFind({
      $or: [{
        pubkey: { $regex: new RegExp(search, 'i') }
      },{
        uid: { $regex: new RegExp(search, 'i') }
      }]
    });
  };

  this.kickMembersForMembershipBelow = (maxNumber) => co(function *() {
    let toKick = yield that.lokiFind({
      currentMSN: { $lte: maxNumber }
    },{
      kick: false,
      member: true
    });
    for (let i = 0; i < toKick.length; i++) {
      let idty = toKick[i];
      idty.kick = true;
      collection.update(idty);
    }
  });
}