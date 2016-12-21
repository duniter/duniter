/**
 * Created by cgeek on 22/08/15.
 */

const Q = require('q');
const co = require('co');
const logger = require('../../logger')('idtyDAL');
const constants = require('../../constants');
const AbstractSQLite = require('./AbstractSQLite');
const SandBox = require('./SandBox');

module.exports = IdentityDAL;

function IdentityDAL(driver, wotb) {

  "use strict";

  AbstractSQLite.call(this, driver);

  const that = this;

  this.table = 'idty';
  this.fields = [
    'revoked',
    'revoked_on',
    'revocation_sig',
    'currentMSN',
    'currentINN',
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
    'wotb_id',
    'expired'
  ];
  this.arrays = [];
  this.booleans = ['revoked', 'member', 'kick', 'leaving', 'wasMember', 'written'];
  this.pkFields = ['pubkey', 'uid', 'hash'];
  this.transientFields = ['certsCount', 'ref_block'];
  this.translated = {};

  this.init = () => co(function *() {
    return that.exec('BEGIN;' +
      'CREATE TABLE IF NOT EXISTS ' + that.table + ' (' +
      'revoked BOOLEAN NOT NULL,' +
      'currentMSN INTEGER NULL,' +
      'currentINN INTEGER NULL,' +
      'buid VARCHAR(100) NOT NULL,' +
      'member BOOLEAN NOT NULL,' +
      'kick BOOLEAN NOT NULL,' +
      'leaving BOOLEAN NULL,' +
      'wasMember BOOLEAN NOT NULL,' +
      'pubkey VARCHAR(50) NOT NULL,' +
      'uid VARCHAR(255) NOT NULL,' +
      'sig VARCHAR(100) NOT NULL,' +
      'revocation_sig VARCHAR(100) NULL,' +
      'hash VARCHAR(64) NOT NULL,' +
      'written BOOLEAN NULL,' +
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
      'CREATE INDEX IF NOT EXISTS idx_idty_currentINN ON idty (currentINN);' +
      'COMMIT;', []);
  });

  this.revokeIdentity = (pubkey, number) => {
    return co(function *() {
      const idty = yield that.getFromPubkey(pubkey);
      idty.revoked = true;
      idty.revoked_on = number;
      return that.saveIdentity(idty);
    });
  };

  this.unrevokeIdentity = (pubkey) => co(function *() {
    const idty = yield that.getFromPubkey(pubkey);
    idty.revoked = false;
    idty.revoked_on = null;
    return that.saveIdentity(idty);
  });

  this.excludeIdentity = (pubkey) => co(function *() {
    const idty = yield that.getFromPubkey(pubkey);
    idty.member = false;
    idty.kick = false;
    wotb.setEnabled(false, idty.wotb_id);
    return that.saveIdentity(idty);
  });

  this.unacceptIdentity = (pubkey) => co(function *() {
    const idty = yield that.getFromPubkey(pubkey);
    idty.written = false;
    idty.wasMember = false;
    idty.member = false;
    idty.kick = false;
    idty.wotb_id = wotb.removeNode();
    return that.saveIdentity(idty);
  });

  this.unJoinIdentity = (ms) => co(function *() {
    const idty = yield that.getFromPubkey(ms.issuer);
    idty.member = false;
    /**
     * Note: it is not required to do:
     *
     *     `idty.wasMember = false;`
     *
     * because this is already done by `unacceptIdentity` method.
     */
    wotb.setEnabled(false, idty.wotb_id);
    return that.saveIdentity(idty);
  });

  this.unExcludeIdentity = (pubkey, causeWasRevocation) => co(function *() {
    const idty = yield that.getFromPubkey(pubkey);
    idty.member = true;
    idty.kick = !causeWasRevocation;
    wotb.setEnabled(true, idty.wotb_id);
    return that.saveIdentity(idty);
  });

  this.newIdentity = function(idty) {
    idty.member = true;
    idty.wasMember = true;
    idty.kick = false;
    idty.written = true;
    idty.wotb_id = wotb.addNode();
    logger.trace('%s was affected wotb_id %s', idty.uid, idty.wotb_id);
    return that.saveIdentity(idty);
  };

  this.joinIdentity = (pubkey) =>  co(function *() {
    const idty = yield that.getFromPubkey(pubkey);
    idty.member = true;
    idty.wasMember = true;
    wotb.setEnabled(true, idty.wotb_id);
    return that.saveIdentity(idty);
  });

  this.activeIdentity = (pubkey) => co(function *() {
    const idty = yield that.getFromPubkey(pubkey);
    idty.member = true;
    idty.kick = false;
    wotb.setEnabled(true, idty.wotb_id);
    return that.saveIdentity(idty);
  });

  this.leaveIdentity = (pubkey) => co(function *() {
    const idty = yield that.getFromPubkey(pubkey);
    return that.saveIdentity(idty);
  });

  this.removeUnWrittenWithPubkey = (pubkey) => this.sqlRemoveWhere({
    pubkey: pubkey,
    written: false
  });

  this.removeUnWrittenWithUID = (uid) => this.sqlRemoveWhere({
    uid: uid,
    written: false
  });

  this.getFromPubkey = (pubkey) => this.sqlFindOne({
    pubkey: pubkey,
    wasMember: true
  });

  this.getFromUID = (uid) => this.sqlFindOne({
    uid: uid,
    wasMember: true
  });

  this.getByHash = (hash) => this.sqlFindOne({
    hash: hash
  });

  this.getLatestMember = () => that.sqlFindOne({
    wasMember: true
  }, {
    wotb_id: this.DESC
  });

  this.saveIdentity = (idty) =>
    this.saveEntity(idty);

  this.getWhoIsOrWasMember = () => that.sqlFind({
    wasMember: true
  });

  this.getToRevoke = () => that.sqlFind({
    revocation_sig: { $null: false },
    revoked: false,
    wasMember: true
  });

  this.getPendingIdentities = () => that.sqlFind({
    wasMember: false
  });

  this.searchThoseMatching = (search) => that.sqlFindLikeAny({
    pubkey: "%" + search + "%",
    uid: "%" + search + "%"
  });

  this.flagExpiredIdentities = (maxNumber, onNumber) => co(function *() {
    yield that.exec('UPDATE ' + that.table + ' ' +
      'SET expired = ' + onNumber + ' ' +
      'WHERE expired IS NULL ' +
      'AND CAST(SUBSTR(buid, 0, INSTR(buid, "-")) as number) <= ' + maxNumber);
  });

  this.unflagExpiredIdentitiesOf = (onNumber) => co(function *() {
    yield that.exec('UPDATE ' + that.table + ' ' +
      'SET expired = NULL ' +
      'WHERE expired = ' + onNumber);
  });

  this.unFlagToBeKicked = () => that.exec('UPDATE ' + that.table + ' SET kick = 0 WHERE kick');

  /**************************
   * SANDBOX STUFF
   */

  this.getSandboxIdentities = () => that.query('SELECT * FROM sandbox_idty LIMIT ' + (that.sandbox.maxSize), []);

  this.sandbox = new SandBox(constants.SANDBOX_SIZE_IDENTITIES, this.getSandboxIdentities.bind(this), (compared, reference) => {
    if (compared.certsCount < reference.certsCount) {
      return -1;
    }
    else if (compared.certsCount > reference.certsCount) {
      return 1;
    }
    else if (compared.ref_block < reference.ref_block) {
      return -1;
    }
    else if (compared.ref_block > reference.ref_block) {
      return 1;
    }
    else {
      return 0;
    }
  });

  this.getSandboxRoom = () => this.sandbox.getSandboxRoom();
  this.setSandboxSize = (maxSize) => this.sandbox.maxSize = maxSize;
}
