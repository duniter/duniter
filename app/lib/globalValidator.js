"use strict";

var Q             = require('q');
var _             = require('underscore');
var co            = require('co');
var async         = require('async');
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

  var that = this;

  var testFunctions = [
    { name: 'checkNumber',                          func: check(rules.GLOBAL.checkNumber)                          },
    { name: 'checkPreviousHash',                    func: check(rules.GLOBAL.checkPreviousHash)                    },
    { name: 'checkPreviousIssuer',                  func: check(rules.GLOBAL.checkPreviousIssuer)                  },
    { name: 'checkIssuerIsMember',                  func: check(rules.GLOBAL.checkIssuerIsMember)                  },
    { name: 'checkTimes',                           func: check(_.partial(rules.GLOBAL.checkTimes, _, conf, _))                           },
    { name: 'checkIdentityUnicity',                 func: check(_.partial(rules.GLOBAL.checkIdentityUnicity, _, conf, _))                 },
    { name: 'checkPubkeyUnicity',                   func: check(_.partial(rules.GLOBAL.checkPubkeyUnicity, _, conf, _))                   },
    { name: 'checkJoiners',                         func: check(_.partial(rules.GLOBAL.checkJoiners, _, conf, _))                         },
    { name: 'checkJoinersHaveEnoughCertifications', func: check(_.partial(rules.GLOBAL.checkJoinersHaveEnoughCertifications, _, conf, _)) },
    { name: 'checkJoinersAreNotOudistanced',        func: check(_.partial(rules.GLOBAL.checkJoinersAreNotOudistanced, _, conf, _))        },
    { name: 'checkActives',                         func: check(_.partial(rules.GLOBAL.checkActives, _, conf, _))                         },
    { name: 'checkActivesAreNotOudistanced',        func: check(_.partial(rules.GLOBAL.checkActivesAreNotOudistanced, _, conf, _))        },
    { name: 'checkLeavers',                         func: check(_.partial(rules.GLOBAL.checkLeavers, _, conf, _))                         },
    { name: 'checkRevoked',                         func: check(_.partial(rules.GLOBAL.checkRevoked, _, conf, _))                         },
    { name: 'checkJoinersAreNotRevoked',            func: check(_.partial(rules.GLOBAL.checkJoinersAreNotRevoked, _, conf, _))            },
    { name: 'checkExcluded',                        func: check(_.partial(rules.GLOBAL.checkExcluded, _, conf, _))                        },
    { name: 'checkKickedMembersAreExcluded',        func: check(_.partial(rules.GLOBAL.checkKickedMembersAreExcluded, _, conf, _))        },
    { name: 'checkCertificationsAreWritable',       func: check(_.partial(rules.GLOBAL.checkCertificationsAreWritable, _, conf, _))       },
    { name: 'checkCertificationsAreMadeByMembers',  func: check(rules.GLOBAL.checkCertificationsAreMadeByMembers)  },
    { name: 'checkCertificationsAreValid',          func: check(_.partial(rules.GLOBAL.checkCertificationsAreValid, _, conf, _))          },
    { name: 'checkCertificationsAreMadeToMembers',  func: check(rules.GLOBAL.checkCertificationsAreMadeToMembers)  },
    { name: 'checkCertificationsAreMadeToNonLeaver',func: check(rules.GLOBAL.checkCertificationsAreMadeToNonLeaver)},
    { name: 'checkCertificationsDelayIsRespected',  func: check(_.partial(rules.GLOBAL.checkCertificationsDelayIsRespected, _, conf, _))  },
    { name: 'checkCertificationsPeriodIsRespected', func: check(_.partial(rules.GLOBAL.checkCertificationsPeriodIsRespected, _, conf, _)) },
    { name: 'checkMembersCountIsGood',              func: check(rules.GLOBAL.checkMembersCountIsGood)              },
    { name: 'checkPoWMin',                          func: check(_.partial(rules.GLOBAL.checkPoWMin, _, conf, _))                          },
    { name: 'checkProofOfWork',                     func: check(_.partial(rules.GLOBAL.checkProofOfWork, _, conf, _))                     },
    { name: 'checkUD',                              func: check(_.partial(rules.GLOBAL.checkUD, _, conf, _))                              },
    { name: 'checkTransactions',                    func: check(_.partial(rules.GLOBAL.checkSourcesAvailability, _, conf, _))             }
  ];

  // Functions used in an external for testing a block's content
  testFunctions.forEach(function (fObj) {
    that[fObj.name] = fObj.func;
  });

  this.validate = function (block, done) {
    var testFunctionsPrepared = [];
    testFunctions.forEach(function (obj) {
      testFunctionsPrepared.push((next) => {
        return obj.func(new Block(block), dal).then((res) => next(null, res)).catch(next);
      });
    });
    async.series(testFunctionsPrepared, function (err) {
      done(err);
    });
  };

  this.validateWithoutPoW = function (block, done) {
    var testFunctionsPrepared = [];
    _.filter(testFunctions, function(test) {
      return test.name != 'checkProofOfWork';
    }).forEach(function (obj) {
      testFunctionsPrepared.push((next) => {
        return obj.func(new Block(block), dal).then((res) => next(null, res)).catch(next);
      });
    });
    async.series(testFunctionsPrepared, function (err) {
      done(err);
    });
  };

  /**
  * Function for testing constraints.
  * Useful for function signature reason: it won't give any result in final callback.
  */
  function check (fn) {
    return function (block, dal2) {
      return fn(block, dal2);
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
