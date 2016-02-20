"use strict";

var co            = require('co');
var rules         = require('../lib/rules');
var Block         = require('../lib/entity/block');

module.exports = function (conf, dal) {
  
  return new GlobalValidator(conf, dal);
};

function GlobalValidator (conf, dal) {

  this.checkSingleTransaction = (tx, block) => rules.GLOBAL.checkSourcesAvailability({
    getTransactions: () => [tx],
    medianTime: block.medianTime
  }, conf, dal);

  this.checkExistsUserID = rules.HELPERS.checkExistsUserID;
  this.checkExistsPubkey = rules.HELPERS.checkExistsPubkey;

  this.validate = check(rules.ALIAS.ALL_GLOBAL);
  this.validateWithoutPoW = check(rules.ALIAS.ALL_GLOBAL_WITHOUT_POW);

  function check(contract) {
    return (b, done) => {
      return co(function *() {
        var block = new Block(b);
        yield contract(block, conf, dal);
        done && done();
      })
        .catch((err) => {
          if (done) return done(err);
          throw err;
        });
    };
  }

  this.checkMembershipBlock = rules.HELPERS.checkMembershipBlock;

  this.checkCertificationIsValidForBlock = rules.HELPERS.checkCertificationIsValidForBlock;

  this.checkCertificationIsValid = rules.HELPERS.checkCertificationIsValid;

  this.isOver3Hops = rules.HELPERS.isOver3Hops;

  this.getTrialLevel = rules.HELPERS.getTrialLevel;

  this.getPoWMin = rules.HELPERS.getPoWMin;

  this.getMedianTime = rules.HELPERS.getMedianTime;
}
