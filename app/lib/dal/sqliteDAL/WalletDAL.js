/**
 * Created by cgeek on 22/08/15.
 */

const co = require('co');
const AbstractSQLite = require('./AbstractSQLite');

module.exports = WalletDAL;

/**
 * Facility table saving the current state of a wallet.
 * @param driver SQL driver for making SQL requests.
 * @constructor
 */
function WalletDAL(driver) {

  "use strict";

  AbstractSQLite.call(this, driver);

  const that = this;

  this.table = 'wallet';
  this.fields = [
    'conditions',
    'balance'
  ];
  this.arrays = [];
  this.booleans = [];
  this.pkFields = ['conditions'];
  this.translated = {};

  this.init = () => co(function *() {
    return that.exec('BEGIN;' +
      'CREATE TABLE IF NOT EXISTS ' + that.table + ' (' +
      'conditions TEXT NOT NULL,' +
      'balance INTEGER NOT NULL,' +
      'PRIMARY KEY (conditions)' +
      ');' +
      'CREATE INDEX IF NOT EXISTS wallet_balance ON wallet(balance);' +
      'COMMIT;', []);
  });

  this.getWallet = (conditions) => this.sqlFindOne({ conditions });

  this.saveWallet = (wallet) => this.saveEntity(wallet);
}
