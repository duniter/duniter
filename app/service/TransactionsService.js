"use strict";

const co              = require('co');
const Q               = require('q');
const moment          = require('moment');
const rules           = require('../lib/rules');
const Transaction     = require('../lib/entity/transaction');
const AbstractService = require('./AbstractService');

module.exports = () => {
  return new TransactionService();
};

function TransactionService () {

  AbstractService.call(this);

  let conf, dal;

  this.setConfDAL = (newConf, newDAL) => {
    dal = newDAL;
    conf = newConf;
  };

  this.processTx = (txObj) => this.pushFIFO(() => co(function *() {
    const tx = new Transaction(txObj, conf.currency);
    const existing = yield dal.getTxByHash(tx.hash);
    const current = yield dal.getCurrentBlockOrNull();
    if (existing) {
      throw 'Transaction already processed';
    }
    // Start checks...
    const transaction = tx.getTransaction();
    const nextBlockWithFakeTimeVariation = { medianTime: current.medianTime + 1 };
    yield Q.nbind(rules.HELPERS.checkSingleTransactionLocally, rules.HELPERS)(transaction);
    yield rules.HELPERS.checkSingleTransaction(transaction, nextBlockWithFakeTimeVariation, conf, dal);
    yield dal.saveTransaction(tx);
    return tx;
  }));
}
