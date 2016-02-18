"use strict";
var co = require('co');
var rules = require('./rules');
var Block = require('../lib/entity/block');

module.exports = function (conf) {
  
  return new LocalValidator(conf);
};

function LocalValidator (conf) {

  this.validate = check(rules.ALIAS.ALL);
  this.validateWithoutPoWAndSignature = check(rules.ALIAS.ALL_BUT_POW_AND_SIGNATURE);

  function check(contract) {
    return (b, done) => {
      return co(function *() {
        var block = new Block(b);
        yield contract(block, conf);
        done && done();
      })
        .catch((err) => {
          if (done) return done(err);
          throw err;
        });
    };
  }

  this.maxAcceleration = () => rules.HELPERS.maxAcceleration(conf);
  this.checkSingleMembershipSignature = rules.HELPERS.checkSingleMembershipSignature;
  this.getSigResult = rules.HELPERS.getSigResult;

  this.checkSingleTransaction = (tx, done) => this.checkBunchOfTransactions([tx], done);

  this.checkBunchOfTransactions = (txs, done) => {
    var block = {
      getTransactions: function () {
        return txs;
      }
    };
    return co(function *() {
      let local_rule = rules.LOCAL;
      yield local_rule.checkTxIssuers(block);
      yield local_rule.checkTxSources(block);
      yield local_rule.checkTxRecipients(block);
      yield local_rule.checkTxSignature(block);
      done && done();
    })
      .catch((err) => {
        if (done) return done(err);
        throw err;
      });
  };
}
