/**
 * Created by cgeek on 22/08/15.
 */

const Q = require('q');
const co = require('co');
const AbstractSQLite = require('./AbstractSQLite');
const constants = require('../../constants');
const SandBox = require('./SandBox');

module.exports = CertDAL;

function CertDAL(driver) {

  "use strict";

  AbstractSQLite.call(this, driver);

  const that = this;

  this.table = 'cert';
  this.fields = [
    'linked',
    'written',
    'written_block',
    'written_hash',
    'sig',
    'block_number',
    'block_hash',
    'target',
    'to',
    'from',
    'block',
    'expired'
  ];
  this.arrays = [];
  this.booleans = ['linked', 'written'];
  this.pkFields = ['from','target','sig'];
  this.translated = {};

  this.init = () => co(function *() {
    return that.exec('BEGIN;' +
      'CREATE TABLE IF NOT EXISTS ' + that.table + ' (' +
      '`from` VARCHAR(50) NOT NULL,' +
      '`to` VARCHAR(50) NOT NULL,' +
      'target CHAR(64) NOT NULL,' +
      'sig VARCHAR(100) NOT NULL,' +
      'block_number INTEGER NOT NULL,' +
      'block_hash VARCHAR(64),' +
      'block INTEGER NOT NULL,' +
      'linked BOOLEAN NOT NULL,' +
      'written BOOLEAN NOT NULL,' +
      'written_block INTEGER,' +
      'written_hash VARCHAR(64),' +
      'PRIMARY KEY (`from`, target, sig, written_block)' +
      ');' +
      'CREATE INDEX IF NOT EXISTS idx_cert_from ON cert (`from`);' +
      'CREATE INDEX IF NOT EXISTS idx_cert_target ON cert (target);' +
      'CREATE INDEX IF NOT EXISTS idx_cert_linked ON cert (linked);' +
      'COMMIT;', []);
  });

  this.beforeSaveHook = function(entity) {
    entity.written = entity.written || !!(entity.written_hash);
  };

  this.getToTarget = (hash) => this.sqlFind({
    target: hash
  });

  this.getFromPubkey = (pubkey) => this.sqlFind({
    from: pubkey
  });

  this.getNotLinked = () => this.sqlFind({
    linked: false
  });

  this.getNotLinkedToTarget = (hash) => this.sqlFind({
    target: hash,
    linked: false
  });

  this.listLocalPending = () => Q([]);

  this.saveOfficial = (cert) => {
    cert.linked = true;
    return this.saveEntity(cert);
  };

  this.saveCert = (cert) => this.saveEntity(cert);

  this.saveNewCertification = (cert) => this.saveEntity(cert);

  this.existsGivenCert = (cert) => Q(this.sqlExisting(cert));

  this.updateBatchOfCertifications = (certs) => co(function *() {
    const queries = [];
    const insert = that.getInsertHead();
    const values = certs.map((cert) => that.getInsertValue(cert));
    if (certs.length) {
      queries.push(insert + '\n' + values.join(',\n') + ';');
    }
    if (queries.length) {
      return that.exec(queries.join('\n'));
    }
  });

  this.flagExpiredCertifications = (maxNumber, onNumber) => co(function *() {
    yield that.exec('UPDATE ' + that.table + ' ' +
      'SET expired = ' + onNumber + ' ' +
      'WHERE expired IS NULL ' +
      'AND block_number <= ' + maxNumber);
  });

  this.unflagExpiredCertificationsOf = (onNumber) => co(function *() {
    yield that.exec('UPDATE ' + that.table + ' ' +
      'SET expired = NULL ' +
      'WHERE expired = ' + onNumber);
  });

  /**************************
   * SANDBOX STUFF
   */

  this.getSandboxCertifications = () => that.query('SELECT * FROM sandbox_certs LIMIT ' + (that.sandbox.maxSize), []);

  this.sandbox = new SandBox(constants.SANDBOX_SIZE_CERTIFICATIONS, this.getSandboxCertifications.bind(this), (compared, reference) => {
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