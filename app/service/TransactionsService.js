"use strict";
var async           = require('async');
var localValidator  = require('../lib/localValidator');
var globalValidator = require('../lib/globalValidator');
var blockchainDao   = require('../lib/blockchainDao');

module.exports = function (conf, dal) {
  return new TransactionService(conf, dal);
};

function TransactionService (conf, dal) {

  var Transaction = require('../lib/entity/transaction');

  this.processTx = function (txObj, done) {
    var tx = new Transaction(txObj, conf.currency);
    var localValidation = localValidator(conf);
    var globalValidation = null;
    async.waterfall([
      function (next) {
        transactionAlreadyProcessed(tx, next);
      },
      function (alreadyProcessed, next) {
        if (alreadyProcessed)
          next('Transaction already processed');
        else
          dal.getCurrent(next);
      },
      function (current, next) {
        // Validator OK
        globalValidation = globalValidator(conf, blockchainDao(current, dal));
        // Start checks...
        localValidation.checkSingleTransaction(tx.getTransaction(), next);
      },
      function (next) {
        globalValidation.checkSingleTransaction(tx.getTransaction(), next);
      },
      function (next) {
        // Save the transaction
        dal.saveTransaction(tx, function (err) {
          next(err, tx);
        });
      }
    ], done);
  };

  function transactionAlreadyProcessed (tx, done) {
    dal.getTxByHash(tx.hash, done);
  }
}
