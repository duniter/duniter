"use strict";

var co              = require('co');
var Q               = require('q');
var moment          = require('moment');
var rules           = require('../lib/rules');
var Transaction     = require('../lib/entity/transaction');
var AbstractService = require('./AbstractService');

module.exports = function (conf, dal) {
  return new TransactionService(conf, dal);
};

function TransactionService (conf, dal) {

  AbstractService.call(this);

  this.processTx = (txObj) => this.pushFIFO(() => co(function *() {
    var tx = new Transaction(txObj, conf.currency);
    var existing = yield dal.getTxByHash(tx.hash);
    if (existing) {
      throw 'Transaction already processed';
    }
    // Start checks...
    var transaction = tx.getTransaction();
    yield Q.nbind(rules.HELPERS.checkSingleTransactionLocally, rules.HELPERS)(transaction);
    yield rules.HELPERS.checkSingleTransaction(transaction, { medianTime: moment().utc().unix() }, conf, dal);
    yield dal.saveTransaction(tx);
    return tx;
  }));
}
