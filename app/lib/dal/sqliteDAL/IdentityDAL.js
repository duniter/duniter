/**
 * Created by cgeek on 22/08/15.
 */

const co = require('co');
const constants = require('../../constants');
const AbstractSQLite = require('./AbstractSQLite');
const SandBox = require('./SandBox');

module.exports = IdentityDAL;

function IdentityDAL(driver) {

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
    'expired',
    'expires_on'
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
      'expires_on INTEGER NULL,' +
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

  this.revokeIdentity = (pubkey) => this.exec('DELETE FROM ' + this.table + ' WHERE pubkey = \'' + pubkey + '\'');

  this.removeUnWrittenWithPubkey = (pubkey) => this.sqlRemoveWhere({
    pubkey: pubkey,
    written: false
  });

  this.removeUnWrittenWithUID = (uid) => this.sqlRemoveWhere({
    uid: uid,
    written: false
  });

  this.getByHash = (hash) => this.sqlFindOne({
    hash: hash
  });

  this.saveIdentity = (idty) =>
    this.saveEntity(idty);

  this.getToRevoke = () => that.sqlFind({
    revocation_sig: { $null: false },
    revoked: false,
    wasMember: true
  });

  this.getPendingIdentities = () => that.sqlFind({
    revocation_sig: { $null: false },
    revoked: false
  });

  this.searchThoseMatching = (search) => that.sqlFindLikeAny({
    pubkey: "%" + search + "%",
    uid: "%" + search + "%"
  });

  this.trimExpiredIdentities = (medianTime) => this.exec('DELETE FROM ' + this.table + ' WHERE expires_on IS NULL OR expires_on < ' + medianTime);

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
