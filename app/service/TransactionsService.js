"use strict";

var co     = require('co');
var Q      = require('q');
var moment = require('moment');
var rules  = require('../lib/rules');

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
    return co(function *() {
      var existing = yield dal.getTxByHash(tx.hash);
      if (existing) {
        throw 'Transaction already processed';
      }
      // Start checks...
      var transaction = tx.getTransaction();
      yield Q.nbind(rules.HELPERS.checkSingleTransactionLocally, rules.HELPERS)(transaction);
      yield rules.HELPERS.checkSingleTransaction(transaction, { medianTime: moment().utc().unix() }, conf, dal);
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
