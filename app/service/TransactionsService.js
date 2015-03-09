var async           = require('async');
var _               = require('underscore');
var logger          = require('../lib/logger')();
var localValidator  = require('../lib/localValidator');
var globalValidator = require('../lib/globalValidator');
var blockchainDao   = require('../lib/blockchainDao');

module.exports.get = function (conn, conf, dal) {
  return new TransactionService(conn, conf, dal);
};

function TransactionService (conn, conf, dal) {

  var Transaction = conn.model('Transaction');

  this.processTx = function (txObj, done) {
    var tx = new Transaction(txObj);
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
        globalValidation = globalValidator(conf, blockchainDao(conn, current, dal));
        // Start checks...
        localValidation.checkSingleTransaction(tx.getTransaction(), next);
      },
      function (next) {
        globalValidation.checkSingleTransaction(tx.getTransaction(), next);
      },
      function (next) {
        // Save the transaction
        tx.save(function (err) {
          next(err, tx);
        });
      }
    ], done);
  };

  function transactionAlreadyProcessed (tx, done) {
    Transaction.getByHash(tx.hash, done);
  }
}
