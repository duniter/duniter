var async           = require('async');
var _               = require('underscore');
var logger          = require('../lib/logger')();
var localValidator  = require('../lib/localValidator');
var globalValidator = require('../lib/globalValidator');
var blockchainDao   = require('../lib/blockchainDao');

module.exports.get = function (conn, conf, PeeringService) {
  return new TransactionService(conn, conf, PeeringService);
};

function TransactionService (conn, conf, PeeringService) {

  var Transaction = conn.model('Transaction');
  var Block       = conn.model('Block');

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
          Block.current(next);
      },
      function (current, next) {
        // Validator OK
        globalValidation = globalValidator(conf, blockchainDao(conn, current));
        // Start checks...
        localValidation.checkSingleTransaction(tx.getTransaction(), next);
      },
      function (next) {
        localValidation.checkSingleTransactionSignature(tx.getTransaction(), next);
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
  }

  function transactionAlreadyProcessed (tx, done) {
    Transaction.getByHash(tx.hash, done);
  }
};
