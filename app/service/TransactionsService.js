"use strict";

const co              = require('co');
const Q               = require('q');
const constants       = require('../lib/constants');
const rules           = require('../lib/rules');
const Transaction     = require('../lib/entity/transaction');
const AbstractService = require('./AbstractService');

module.exports = () => {
  return new TransactionService();
};

function TransactionService () {

  AbstractService.call(this);

  const CHECK_PENDING_TRANSACTIONS = true;

  let conf, dal, logger;

  this.setConfDAL = (newConf, newDAL) => {
    dal = newDAL;
    conf = newConf;
    logger = require('../lib/logger')(dal.profile);
  };

  this.processTx = (txObj) => this.pushFIFO(() => co(function *() {
    const tx = new Transaction(txObj, conf.currency);
    try {
      logger.info('⬇ TX %s:%s from %s', tx.output_amount, tx.output_base, tx.issuers);
      const existing = yield dal.getTxByHash(tx.hash);
      const current = yield dal.getCurrentBlockOrNull();
      if (existing) {
        throw constants.ERRORS.TX_ALREADY_PROCESSED;
      }
      // Start checks...
      const transaction = tx.getTransaction();
      const nextBlockWithFakeTimeVariation = { medianTime: current.medianTime + 1 };
      yield Q.nbind(rules.HELPERS.checkSingleTransactionLocally, rules.HELPERS)(transaction);
      yield rules.HELPERS.checkTxBlockStamp(transaction, dal);
      yield rules.HELPERS.checkSingleTransaction(transaction, nextBlockWithFakeTimeVariation, conf, dal, CHECK_PENDING_TRANSACTIONS);
      const server_pubkey = conf.pair && conf.pair.pub;
      transaction.pubkey = transaction.issuers.indexOf(server_pubkey) !== -1 ? server_pubkey : '';
      if (!(yield dal.txsDAL.sandbox.acceptNewSandBoxEntry(transaction, server_pubkey))) {
        throw constants.ERRORS.SANDBOX_FOR_TRANSACTION_IS_FULL;
      }
      tx.blockstampTime = transaction.blockstampTime;
      yield dal.saveTransaction(tx);
      logger.info('✔ TX %s:%s from %s', tx.output_amount, tx.output_base, tx.issuers);
      return tx;
    } catch (e) {
      logger.info('✘ TX %s:%s from %s', tx.output_amount, tx.output_base, tx.issuers);
      throw e;
    }
  }));
}
