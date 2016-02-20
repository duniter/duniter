"use strict";

var co = require('co');
var Q = require('q');
var moment          = require('moment');
var localValidator  = require('../lib/localValidator');
var globalValidator = require('../lib/globalValidator');

module.exports = function (conf, dal) {
  return new TransactionService(conf, dal);
};

function TransactionService (conf, dal) {

  var Transaction = require('../lib/entity/transaction');

  this.setDAL = function(theDAL) {
    dal = theDAL;
  };

  this.processTx = function (txObj, done) {
    var tx = new Transaction(txObj, conf.currency);
    var localValidation = localValidator(conf);
    var globalValidation = null;
    return co(function *() {
      var existing = yield dal.getTxByHash(tx.hash);
      if (existing) {
        throw 'Transaction already processed';
      }
      // Validator OK
      globalValidation = globalValidator(conf, dal);
      // Start checks...
      var transaction = tx.getTransaction();
      yield Q.nbind(localValidation.checkSingleTransaction, localValidation)(transaction);
      yield globalValidation.checkSingleTransaction(transaction, { medianTime: moment().utc().unix() });
      return dal.saveTransaction(tx);
    })
      .then(function(){
        done && done(null, tx);
        return tx;
      })
      .catch(function(err){
        done && done(err);
        throw err;
      });
  };
}
