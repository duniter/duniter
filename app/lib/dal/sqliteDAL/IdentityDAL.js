/**
 * Created by cgeek on 22/08/15.
 */

var Q = require('q');
var co = require('co');
var logger = require('../../../../app/lib/logger')('idtyDAL');
var AbstractSQLite = require('./AbstractSQLite');

module.exports = IdentityDAL;

function IdentityDAL(db, wotb) {

  "use strict";

  AbstractSQLite.call(this, db);

  let that = this;

  this.table = 'idty';
  this.fields = [
    'revoked',
    'currentMSN',
    'memberships',
    'buid',
    'member',
    'kick',
    'leaving',
    'wasMember',
    'pubkey',
    'uid',
    'sig',
    'hash',
    'written',
    'wotb_id'
  ];
  this.arrays = ['memberships'];
  this.booleans = ['revoked', 'member', 'kick', 'leaving', 'wasMember', 'written'];
  this.pkFields = ['pubkey', 'uid', 'hash'];
  this.translated = {};

  this.init = () => co(function *() {
    return that.exec('BEGIN;' +
      'CREATE TABLE IF NOT EXISTS ' + that.table + ' (' +
      'revoked BOOLEAN NOT NULL,' +
      'currentMSN INTEGER NOT NULL,' +
      'memberships TEXT,' +
      'buid VARCHAR(100) NOT NULL,' +
      'member BOOLEAN NOT NULL,' +
      'kick BOOLEAN NOT NULL,' +
      'leaving BOOLEAN NOT NULL,' +
      'wasMember BOOLEAN NOT NULL,' +
      'pubkey VARCHAR(50) NOT NULL,' +
      'uid VARCHAR(255) NOT NULL,' +
      'sig VARCHAR(100) NOT NULL,' +
      'hash VARCHAR(64) NOT NULL,' +
      'written BOOLEAN NOT NULL,' +
      'wotb_id INTEGER NULL,' +
      'PRIMARY KEY (pubkey,uid,hash)' +
      ');' +
      'CREATE INDEX IF NOT EXISTS idx_idty_pubkey ON idty (pubkey);' +
      'CREATE INDEX IF NOT EXISTS idx_idty_uid ON idty (uid);' +
      'CREATE INDEX IF NOT EXISTS idx_idty_kick ON idty (kick);' +
      'CREATE INDEX IF NOT EXISTS idx_idty_member ON idty (member);' +
      'CREATE INDEX IF NOT EXISTS idx_idty_wasMember ON idty (wasMember);' +
      'CREATE INDEX IF NOT EXISTS idx_idty_hash ON idty (hash);' +
      'CREATE INDEX IF NOT EXISTS idx_idty_written ON idty (written);' +
      'CREATE INDEX IF NOT EXISTS idx_idty_currentMSN ON idty (currentMSN);' +
      'COMMIT;', []);
  });

  this.excludeIdentity = (pubkey) => {
    return co(function *() {
      var idty = yield that.getFromPubkey(pubkey);
      idty.member = false;
      idty.kick = false;
      idty.leaving = false;
      wotb.setEnabled(false, idty.wotb_id);
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
      idty.wotb_id = wotb.removeNode();
      return that.saveIdentity(idty);
    });
  };

  this.unJoinIdentity = (ms) => {
    return co(function *() {
      var idty = yield that.getFromPubkey(ms.issuer);
      idty.memberships.pop();
      idty.currentMSN = previousMSN(idty);
      idty.member = false;
      wotb.setEnabled(false, idty.wotb_id);
      return that.saveIdentity(idty);
    });
  };

  this.unRenewIdentity = (pubkey) => {
    return co(function *() {
      var idty = yield that.getFromPubkey(pubkey);
      idty.memberships.pop();
      idty.currentMSN = previousMSN(idty);
      return that.saveIdentity(idty);
    });
  };

  this.unLeaveIdentity = (pubkey) => {
    return co(function *() {
      var idty = yield that.getFromPubkey(pubkey);
      idty.memberships.pop();
      idty.currentMSN = previousMSN(idty);
      idty.leaving = false;
      return that.saveIdentity(idty);
    });
  };

  this.unExcludeIdentity = (pubkey) => {
    return co(function *() {
      var idty = yield that.getFromPubkey(pubkey);
      idty.memberships.pop();
      idty.currentMSN = previousMSN(idty);
      idty.leaving = false;
      wotb.setEnabled(true, idty.wotb_id);
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
    idty.wotb_id = wotb.addNode();
    logger.trace('%s was affected wotb_id %s', idty.uid, idty.wotb_id);
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
      wotb.setEnabled(true, idty.wotb_id);
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
      wotb.setEnabled(true, idty.wotb_id);
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

  this.removeUnWrittenWithPubkey = (pubkey) => this.sqlRemoveWhere({
    pubkey: pubkey,
    written: false
  });

  this.removeUnWrittenWithUID = (uid) => this.sqlRemoveWhere({
    uid: uid,
    written: false
  });

  this.getFromPubkey = function(pubkey) {
    return that.sqlFindOne({
      pubkey: pubkey,
      wasMember: true
    });
  };

  this.getFromUID = function(uid) {
    return that.sqlFindOne({
      uid: uid,
      wasMember: true
    });
  };

  this.getByHash = function(hash) {
    return that.sqlFindOne({
      hash: hash
    });
  };

  this.saveIdentity = (idty) =>
    this.saveEntity(idty);

  this.getWhoIsOrWasMember = function() {
    return that.sqlFind({
      wasMember: true
    });
  };

  this.getPendingIdentities = function() {
    return that.sqlFind({
      wasMember: false
    });
  };

  this.listLocalPending = () => Q([]);

  this.searchThoseMatching = function(search) {
    return that.sqlFindLikeAny({
      pubkey: "%" + search + "%",
      uid: "%" + search + "%"
    });
  };

  this.kickMembersForMembershipBelow = (maxNumber) => co(function *() {
    let toKick = yield that.sqlFind({
      currentMSN: { $lte: maxNumber },
      kick: false,
      member: true
    });
    for (let i = 0; i < toKick.length; i++) {
      let idty = toKick[i];
      logger.trace('Kick %s for currentMSN <= %s', idty.uid, maxNumber);
      idty.kick = true;
      yield that.saveEntity(idty);
    }
  });

  function previousMSN(idty) {
    let msn = idty.memberships[idty.memberships.length - 1];
    if (msn === null || msn === undefined) {
      msn = -1;
    }
    return msn;
  }
}