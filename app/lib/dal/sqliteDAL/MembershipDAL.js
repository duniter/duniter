/**
 * Created by cgeek on 22/08/15.
 */

const Q = require('q');
const co = require('co');
const _ = require('underscore');
const AbstractSQLite = require('./AbstractSQLite');
const constants = require('../../constants');
const SandBox = require('./SandBox');

module.exports = MembershipDAL;

function MembershipDAL(driver) {

  "use strict";

  AbstractSQLite.call(this, driver);

  const that = this;

  this.table = 'membership';
  this.fields = [
    'membership',
    'issuer',
    'number',
    'blockNumber',
    'blockHash',
    'userid',
    'certts',
    'block',
    'fpr',
    'idtyHash',
    'written',
    'written_number',
    'expires_on',
    'signature',
    'expired'
  ];
  this.arrays = [];
  this.booleans = ['written'];
  this.pkFields = ['issuer','signature'];
  this.translated = {};

  this.init = () => co(function *() {
    return that.exec('BEGIN;' +
      'CREATE TABLE IF NOT EXISTS membership (' +
      'membership CHAR(2) NOT NULL,' +
      'issuer VARCHAR(50) NOT NULL,' +
      'number INTEGER NOT NULL,' +
      'blockNumber INTEGER,' +
      'blockHash VARCHAR(64) NOT NULL,' +
      'userid VARCHAR(255) NOT NULL,' +
      'certts VARCHAR(100) NOT NULL,' +
      'block INTEGER,' +
      'fpr VARCHAR(64),' +
      'idtyHash VARCHAR(64),' +
      'written BOOLEAN NOT NULL,' +
      'written_number INTEGER,' +
      'expires_on INTEGER NULL,' +
      'signature VARCHAR(50),' +
      'PRIMARY KEY (issuer,signature)' +
      ');' +
      'CREATE INDEX IF NOT EXISTS idx_mmembership_idtyHash ON membership (idtyHash);' +
      'CREATE INDEX IF NOT EXISTS idx_mmembership_membership ON membership (membership);' +
      'CREATE INDEX IF NOT EXISTS idx_mmembership_written ON membership (written);' +
      'COMMIT;', []);
  });

  this.getMembershipsOfIssuer = (issuer) => this.sqlFind({
    issuer: issuer
  });

  this.getPendingINOfTarget = (hash) => this.sqlFind({
    idtyHash: hash,
    membership: 'IN'
  });

  this.getPendingIN = () => this.sqlFind({
    membership: 'IN'
  });

  this.getPendingOUT = () => this.sqlFind({
    membership: 'OUT'
  });

  this.savePendingMembership = (ms) => {
    ms.membership = ms.membership.toUpperCase();
    ms.written = false;
    return this.saveEntity(_.pick(ms, 'membership', 'issuer', 'number', 'blockNumber', 'blockHash', 'userid', 'certts', 'block', 'fpr', 'idtyHash', 'expires_on', 'written', 'written_number', 'signature'));
  };

  this.deleteMS = (ms) => this.deleteEntity(ms);

  this.trimExpiredMemberships = (medianTime) => this.exec('DELETE FROM ' + this.table + ' WHERE expires_on IS NULL OR expires_on < ' + medianTime);

  /**************************
   * SANDBOX STUFF
   */

  this.getSandboxMemberships = () => that.query('SELECT * FROM sandbox_memberships LIMIT ' + (that.sandbox.maxSize), []);

  this.sandbox = new SandBox(constants.SANDBOX_SIZE_MEMBERSHIPS, this.getSandboxMemberships.bind(this), (compared, reference) => {
    if (compared.block_number < reference.block_number) {
      return -1;
    }
    else if (compared.block_number > reference.block_number) {
      return 1;
    }
    else {
      return 0;
    }
  });

  this.getSandboxRoom = () => this.sandbox.getSandboxRoom();
  this.setSandboxSize = (maxSize) => this.sandbox.maxSize = maxSize;
}
