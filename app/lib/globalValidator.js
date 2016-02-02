"use strict";

var Q             = require('q');
var _             = require('underscore');
var co            = require('co');
var async         = require('async');
var crypto        = require('./crypto');
var moment        = require('moment');
var util          = require('util');
var stream        = require('stream');
var constants     = require('./constants');
var Block         = require('../lib/entity/block');
var Identity      = require('../lib/entity/identity');
var Membership    = require('../lib/entity/membership');
var Certification = require('../lib/entity/certification');

// Future rule of X_PERCENT of the sentries
const X_PERCENT = 1.0;

module.exports = function (conf, dao) {
  
  return new GlobalValidator(conf, dao);
};

function GlobalValidator (conf, dao) {

  let wotb = dao.wotb;

  this.checkSingleTransaction = function (tx, done) {
    async.series([
      async.apply(checkSourcesAvailabilityForTransaction, tx)
    ], function (err) {
      done(err);
    });
  };

  this.currencyFilter = function (onError) {
    return new CurrencyFilter(conf.currency, onError);
  };

  this.checkExistsUserID = checkExistsUserID;
  this.checkExistsPubkey = checkExistsPubkey;

  var that = this;

  var testFunctions = [
    { name: 'checkNumber',                          func: check(checkNumber)                          },
    { name: 'checkPreviousHash',                    func: check(checkPreviousHash)                    },
    { name: 'checkPreviousIssuer',                  func: check(checkPreviousIssuer)                  },
    { name: 'checkIssuerIsMember',                  func: check(checkIssuerIsMember)                  },
    { name: 'checkTimes',                           func: check(checkTimes)                           },
    { name: 'checkIdentityUnicity',                 func: check(checkIdentityUnicity)                 },
    { name: 'checkPubkeyUnicity',                   func: check(checkPubkeyUnicity)                   },
    { name: 'checkJoiners',                         func: check(checkJoiners)                         },
    { name: 'checkJoinersAreNotRevoked',            func: check(checkJoinersAreNotRevoked)            },
    { name: 'checkJoinersHaveUniqueIdentity',       func: check(checkJoinersHaveUniqueIdentity)       },
    { name: 'checkJoinersHaveEnoughCertifications', func: check(checkJoinersHaveEnoughCertifications) },
    { name: 'checkJoinersAreNotOudistanced',        func: check(checkJoinersAreNotOudistanced)        },
    { name: 'checkActives',                         func: check(checkActives)                         },
    { name: 'checkActivesAreNotOudistanced',        func: check(checkActivesAreNotOudistanced)        },
    { name: 'checkLeavers',                         func: check(checkLeavers)                         },
    { name: 'checkExcluded',                        func: check(checkExcluded)                        },
    { name: 'checkKickedMembersAreExcluded',        func: check(checkKickedMembersAreExcluded)        },
    { name: 'checkCertificationsAreMadeByMembers',  func: check(checkCertificationsAreMadeByMembers)  },
    { name: 'checkCertificationsAreValid',          func: check(checkCertificationsAreValid)          },
    { name: 'checkCertificationsAreMadeToMembers',  func: check(checkCertificationsAreMadeToMembers)  },
    { name: 'checkCertificationsAreMadeToNonLeaver',func: check(checkCertificationsAreMadeToNonLeaver)  },
    { name: 'checkCertificationsDelayIsRespected',  func: check(checkCertificationsDelayIsRespected)  },
    { name: 'checkCertificationsPeriodIsRespected', func: check(checkCertificationsPeriodIsRespected) },
    { name: 'checkMembersCountIsGood',              func: check(checkMembersCountIsGood)              },
    { name: 'checkPoWMin',                          func: check(checkPoWMin)                          },
    { name: 'checkProofOfWork',                     func: check(checkProofOfWork)                     },
    { name: 'checkUD',                              func: check(checkUD)                              },
    { name: 'checkTransactions',                    func: check(checkSourcesAvailability)             }
  ];

  // Functions used in an external for testing a block's content
  testFunctions.forEach(function (fObj) {
    that[fObj.name] = fObj.func;
  });

  // Functions used in an external context too
  this.checkMembershipBlock = function (ms, current, done) {
    checkMSTarget(ms, current ? { number: current.number + 1} : { number: 0 }, done);
  };

  this.checkCertificationIsValid = function (cert, current, findIdtyFunc, done) {
    checkCertificationIsValid(current ? current : { number: 0 }, cert, findIdtyFunc, done);
  };

  this.validate = function (block, done) {
    var testFunctionsPrepared = [];
    testFunctions.forEach(function (obj) {
      testFunctionsPrepared.push(async.apply(obj.func, new Block(block)));
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
      testFunctionsPrepared.push(async.apply(obj.func, new Block(block)));
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
    return function (arg, done) {
      async.series([
        async.apply(fn, arg)
      ], function (err) {
        // Only return err as result
        done(err);
      });
    };
  }

  this.isOver3Hops = function (member, newLinks, newcomers, done) {
    checkPeopleAreNotOudistanced([member], newLinks, newcomers, done);
  };

  this.getTrialLevel = function (issuer, done) {
    return getTrialLevel(issuer, done);
  };

  this.getPoWMin = function (blockNumber) {
    return getPoWMinFor(blockNumber);
  };

  this.getMedianTime = function (blockNumber, done) {
    return getMedianTime(blockNumber, done);
  };

  /*****************************
  *
  *      UTILITY FUNCTIONS
  *
  *****************************/

  /**
  * Get an identity, using global scope.
  * Considers identity collision + existence have already been checked.
  **/
  function getGlobalIdentity (block, pubkey, done) {
    async.waterfall([
      function (next){
        var localInlineIdty = block.getInlineIdentity(pubkey);
        if (localInlineIdty) {
          next(null, Identity.statics.fromInline(localInlineIdty));
        } else {
          dao.getIdentityByPubkey(pubkey, next);
        }
      },
    ], done);
  }

  /**
  * Check wether a pubkey is currently a member or not (globally).
  **/
  function isMember (block, pubkey, done) {
    async.waterfall([
      function (next){
        if (block.isJoining(pubkey)) {
          next(null, true);
        } else {
          dao.isMember(pubkey, next);
        }
      },
    ], done);
  }

  /**
  * Check wether a pubkey is currently a leaver or not (globally).
  **/
  function isNonLeaver (pubkey, done) {
    dao.isLeaving(pubkey, function(err, isLeaver) {
      done(err, !isLeaver);
    });
  }

  function checkCertificationsAreValid (block, done) {
    async.forEachSeries(block.certifications, function(inlineCert, callback){
      var cert = Certification.statics.fromInline(inlineCert);
      checkCertificationIsValid(block, cert, getGlobalIdentity, callback);
    }, done);
  }

  this.checkCertificationIsValidForBlock = function(cert, block, idty) {
    return co(function *() {
      yield Q.nfcall(checkCertificationIsValid, block, cert, function(block, pubkey, done) {
        done(null, idty);
      });
      return true;
    })
      .catch(() => false);
  };

  function checkCertificationIsValid (block, cert, findIdtyFunc, done, doNotThrowExpiration) {
    async.waterfall([
      function (next) {
        if (block.number == 0 && cert.block_number != 0) {
          next('Number must be 0 for root block\'s certifications');
        } else if (block.number == 0 && cert.block_number == 0) {
          next(null, { hash: 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855', medianTime: moment.utc().startOf('minute').unix() }); // Valid for root block
        } else {
          Q.nbind(dao.getBlock, dao)(cert.block_number)
            .then((basedBlock) => next(null, basedBlock))
            .catch((err) => next('Certification based on an unexisting block'));
        }
      },
      function (basedBlock, next){
        async.parallel({
          idty: function (next) {
            findIdtyFunc(block, cert.to, next);
          },
          target: function (next) {
            next(null, basedBlock);
          },
          current: function (next) {
            if (block.number == 0)
              next(null, null);
            else
              dao.getCurrent(next);
          }
        }, next);
      },
      function (res, next){
        if (!res.idty) {
          next('Identity does not exist for certified');
          return;
        }
        else if (!doNotThrowExpiration && res.current && res.current.medianTime > res.target.medianTime + conf.sigValidity) {
          next('Certification has expired');
        }
        else if (cert.from == res.idty.pubkey)
          next('Rejected certification: certifying its own self-certification has no meaning');
        else {
          var selfCert = new Identity(res.idty).selfCert();
          var targetId = [cert.block_number, res.target.hash].join('-');
          crypto.isValidCertification(selfCert, res.idty.sig, cert.from, cert.sig, targetId, next);
        }
      }
    ], function(err) {
      done(err);
    });
  }

  function checkCertificationsAreMadeByMembers (block, done) {
    async.forEach(block.certifications, function(inlineCert, callback){
      var cert = Certification.statics.fromInline(inlineCert);
      async.waterfall([
        function (next){
          isMember(block, cert.from, next);
        },
        function (isMember, next){
          next(isMember ? null : 'Certification from non-member');
        },
      ], callback);
    }, done);
  }

  function checkCertificationsAreMadeToMembers (block, done) {
    async.forEach(block.certifications, function(inlineCert, callback){
      var cert = Certification.statics.fromInline(inlineCert);
      async.waterfall([
        function (next){
          isMember(block, cert.to, next);
        },
        function (isMember, next){
          next(isMember ? null : 'Certification to non-member');
        },
      ], callback);
    }, done);
  }

  function checkCertificationsAreMadeToNonLeaver (block, done) {
    async.forEach(block.certifications, function(inlineCert, callback){
      var cert = Certification.statics.fromInline(inlineCert);
      async.waterfall([
        function (next){
          isNonLeaver(cert.to, next);
        },
        function (isNonLeaver, next){
          next(isNonLeaver ? null : 'Certification to leaver');
        },
      ], callback);
    }, done);
  }

  /*****************************
  *
  *      TESTING FUNCTIONS
  *
  *****************************/

  function checkNumber (block, done) {
    async.waterfall([
      function (next){
        dao.getCurrent(next);
      },
      function (current, next){
        if (!current && block.number != 0)
          next('Root block required first');
        else if (current && block.number <= current.number)
          next('Too late for this block');
        else if (current && block.number > current.number + 1)
          next('Too early for this block');
        else
          next();
      },
    ], done);
  }

  function checkPreviousHash (block, done) {
    async.waterfall([
      function (next){
        dao.getCurrent(next);
      },
      function (current, next){
        if (current && block.previousHash != current.hash)
          next('PreviousHash not matching hash of current block');
        else
          next();
      },
    ], done);
  }

  function checkPreviousIssuer (block, done) {
    async.waterfall([
      function (next){
        dao.getCurrent(next);
      },
      function (current, next){
        if (current && block.previousIssuer != current.issuer)
          next('PreviousIssuer not matching issuer of current block');
        else
          next();
      },
    ], done);
  }

  function checkPoWMin (block, done) {
    if (block.number == 0) {
      done();
      return;
    }
    async.waterfall([
      function (next) {
        getPoWMinFor(block.number)
          .then(function(powmin) {
            next(null, powmin);
          })
          .catch(next);
      },
      function (correctPowMin, next) {
        if (block.powMin < correctPowMin) {
          next('PoWMin value must be incremented');
        }
        else if (correctPowMin < block.powMin) {
          next('PoWMin value must be decremented');
        }
        else {
          next();
        }
      }
    ], function(err, powmin) {
      done(err, powmin);
    });
  }

  /**
  * Deduce the PoWMin field for a given block number
  */
  function getPoWMinFor (blockNumber) {
    return Q.Promise(function(resolve, reject){
      if (blockNumber == 0) {
        reject('Cannot deduce PoWMin for block#0');
      } else if (blockNumber % conf.dtDiffEval != 0) {
        co(function *() {
          var previous = yield dao.getBlock(blockNumber - 1);
          return previous.powMin;
        })
          .then(resolve)
        .catch(function(err) {
          reject(err);
          throw err;
        });
      } else {
        co(function *() {
          var previous = yield dao.getBlock(blockNumber - 1);
          var medianTime = yield getMedianTime(blockNumber);
          var lastDistant = yield dao.getBlock(Math.max(0, blockNumber - conf.dtDiffEval));
          // Compute PoWMin value
          var duration = medianTime - lastDistant.medianTime;
          var speed = parseFloat(conf.dtDiffEval) / duration;
          var maxGenTime = Math.ceil(conf.avgGenTime * Math.sqrt(2));
          var minGenTime = Math.floor(conf.avgGenTime / Math.sqrt(2));
          var maxSpeed = 1.0 / minGenTime;
          var minSpeed = 1.0 / maxGenTime;
          // logger.debug('Current speed is', speed, '(' + conf.dtDiffEval + '/' + duration + ')', 'and must be [', minSpeed, ';', maxSpeed, ']');
          if (speed >= maxSpeed) {
            // Must increase difficulty
            resolve(previous.powMin + 1);
          }
          else if (speed <= minSpeed) {
            // Must decrease difficulty
            resolve(Math.max(0, previous.powMin - 1));
          }
          else {
            // Must not change difficulty
            resolve(previous.powMin);
          }
        })
          .catch(reject);
      }
    });
  }

  function checkProofOfWork (block, done) {
    // Compute exactly how much zeros are required for this block's issuer
    async.waterfall([
      function (next){
        getTrialLevel(block.issuer, next);
      },
      function (difficulty, next){
        var remainder = difficulty % 4;
        var nbZerosReq = Math.max(0, (difficulty - remainder) / 4);
        var highMark = remainder == 3 ? constants.PROOF_OF_WORK.UPPER_BOUND.LEVEL_3
          : (remainder == 2 ? constants.PROOF_OF_WORK.UPPER_BOUND.LEVEL_2
          : (remainder == 1 ? constants.PROOF_OF_WORK.UPPER_BOUND.LEVEL_1
          : constants.PROOF_OF_WORK.UPPER_BOUND.LEVEL_0));
        var powRegexp = new RegExp('^0{' + nbZerosReq + '}' + '[0-' + highMark + ']');
        if (!block.hash.match(powRegexp)) {
          var givenZeros = Math.max(0, Math.min(nbZerosReq, block.hash.match(/^0*/)[0].length));
          var c = block.hash.substr(givenZeros, 1);
          next('Wrong proof-of-work level: given ' + givenZeros + ' zeros and \'' + c + '\', required was ' + nbZerosReq + ' zeros and an hexa char between [0-' + highMark + ']');
        }
        else {
          next();
        }
      }
    ], done);
  }

  function checkTimes (block, done) {
    if (block.number == 0) {
      // No rule to check for block#0
      done();
      return;
    }
    async.waterfall([
      function (next){
        getMedianTime(block.number, next);
      },
      function (median, next) {
        next(median != block.medianTime ? 'Wrong MedianTime' : null);
      }
    ], done);
  }

  function getMedianTime (blockNumber, done) {
    if (blockNumber == 0) {
      // No rule to check for block#0
      done && done(null, 0);
      return Q(0);
    }
    return Q.Promise(function(resolve, reject){
      var blocksCount;
      async.waterfall([
        function (next){
          // Get the number of blocks we can look back from this block
          blocksCount = blockNumber < conf.medianTimeBlocks ? blockNumber : conf.medianTimeBlocks;
          // Get their 'time' value
          // console.log('Times between ', blockNumber - blocksCount, blockNumber - 1);
          dao.getTimesBetween(blockNumber - blocksCount, blockNumber - 1, next);
        },
        function (timeValues, next) {
          timeValues.sort();
          // console.log(timeValues);
          var times = [0];
          var middle;
          if (blocksCount % 2 == 0) {
            // Even number of blocks
            middle = blocksCount / 2;
            times = [timeValues[middle - 1], timeValues[middle]];
            // console.log('middle', middle);
            // console.log('times = ', times);
          }
          else {
            // Odd number of blocks
            middle = (blocksCount - 1) / 2;
            times = [timeValues[middle]];
            // console.log('middle', middle);
            // console.log('times = ', times);
          }
          // Content
          if (times.length == 2) {
            // Even number of times
            next(null, Math.ceil((times[0] + times[1]) / 2));
          }
          else if (times.length == 1) {
            // Odd number of times
            next(null, times[0]);
          }
          else {
            next('No block found for MedianTime comparison');
          }
        }
      ], function(err, block) {
        if (err) {
          done && done(err);
          return reject(err);
        }
        done && done(null, block);
        resolve(block);
      });
    });
  }

  function checkUD (block, done) {
    async.waterfall([
      function (next){
        async.parallel({
          current: function (next) {
            dao.getCurrent(next);
          },
          lastUDBlock: function (next) {
            dao.getLastUDBlock(next);
          },
          root: function (next) {
            dao.getBlock(0, function (err, root) {
              if (root)
                next(null, root);
              else
                next(null, null);
            });
          }
        }, next);
      },
      function (res, next){
        var current = res.current;
        var root = res.root;
        var lastUDTime = res.lastUDBlock ? res.lastUDBlock.UDTime : (root != null ? root.medianTime : 0);
        var UD = res.lastUDBlock ? res.lastUDBlock.dividend : conf.ud0;
        var M = res.lastUDBlock ? res.lastUDBlock.monetaryMass : 0;
        var Nt1 = block.membersCount;
        var c = conf.c;
        var UDt1 = Nt1 > 0 ? Math.ceil(Math.max(UD, c * M / Nt1)) : 0;
        if (!current && block.dividend) {
          next('Root block cannot have UniversalDividend field');
        }
        else if (current && block.medianTime >= lastUDTime + conf.dt && UDt1 && !block.dividend) {
          next('Block must have a UniversalDividend field');
        }
        else if (current && block.medianTime >= lastUDTime + conf.dt && UDt1 && block.dividend != UDt1) {
          next('UniversalDividend must be equal to ' + UDt1);
        }
        else if (current && block.medianTime < lastUDTime + conf.dt && block.dividend) {
          next('This block cannot have UniversalDividend');
        }
        else {
          next();
        }
      },
    ], done);
  }

  function checkSourcesExistence (block, done) {
    async.waterfall([
      function (next){
        var sources = [];
        async.forEachSeries(block.getTransactions(), function (tx, callback) {
          async.forEachSeries(tx.inputs, function (src, callback) {
            async.waterfall([
              function (next) {
                if (src.type == 'D') {
                  dao.existsUDSource(src.number, src.fingerprint, next);
                } else {
                  dao.existsTXSource(src.number, src.fingerprint, next);
                }
              },
              function (exists, next) {
                next(exists ? null : 'Source ' + [src.type, src.number, src.fingerprint].join(':') + ' does not exist');
              }
            ], callback);
          }, callback);
        }, next);
      }
    ], done);
  }

  function checkSourcesAvailability (block, done) {
    async.waterfall([
      function (next){
        var sources = [];
        async.forEachSeries(block.getTransactions(), checkSourcesAvailabilityForTransaction, next);
      }
    ], done);
  }

  function checkSourcesAvailabilityForTransaction (tx, done) {
    async.forEachSeries(tx.inputs, function (src, callback) {
      async.waterfall([
        function (next) {
          if (src.type == 'D') {
            dao.isAvailableUDSource(src.pubkey, src.number, src.fingerprint, src.amount, next);
          } else {
            dao.isAvailableTXSource(src.pubkey, src.number, src.fingerprint, src.amount, next);
          }
        },
        function (isAvailable, next) {
          next(isAvailable ? null : 'Source ' + [src.pubkey, src.type, src.number, src.fingerprint, src.amount].join(':') + ' is not available');
        }
      ], callback);
    }, done);
  }

  function getTrialLevel (issuer, done) {
    // Compute exactly how much zeros are required for this block's issuer
    var powMin = 0;
    var percentRot = conf.percentRot;
    return Q.Promise(function(resolve, reject){
      async.waterfall([
        function (next) {
          dao.getCurrent(next);
        },
        function (current, next) {
          if (!current) {
            next(null, 0);
            return;
          }
          var last;
          async.waterfall([
            function (next){
              async.parallel({
                lasts: function (next) {
                  dao.lastBlockOfIssuer(issuer).then(_.partial(next, null)).catch(next);
                },
                powMin: function (next) {
                  getPoWMinFor(current.number + 1).then(_.partial(next, null)).catch(next);
                }
              }, function (err, res) {
                next(err, res);
              });
            },
            function (res, next){
              powMin = res.powMin;
              last = res.lasts || null;
              if (last) {
                dao.getIssuersBetween(last.number - 1 - conf.blocksRot, last.number - 1, next);
              } else {
                // So we can have nbPreviousIssuers = 0 & nbBlocksSince = 0 for someone who has never written any block
                last = { number: current.number };
                next(null, []);
              }
            },
            function (issuers, next) {
              var nbPreviousIssuers = _(_(issuers).uniq()).without(issuer).length;
              var nbBlocksSince = current.number - last.number;
              var difficulty = Math.max(powMin, powMin * Math.floor(percentRot * (1 + nbPreviousIssuers) / (1 + nbBlocksSince)));
              next(null, difficulty);
            }
          ], next);
        }
      ], function(err, level) {
        done && done(err, level);
        err ? reject(err) : resolve(level);
      });
    });
  }

  function checkIdentityUnicity (block, done) {
    async.forEach(block.identities, function(inlineIdentity, callback){
      var idty = Identity.statics.fromInline(inlineIdentity);
      async.waterfall([
        function (next){
          checkExistsUserID(idty.uid, next);
        },
        function (exists, next){
          next(exists ? 'Identity already used' : null);
        }
      ], callback);
    }, done);
  }

  function checkExistsUserID(uid, done) {
    dao.existsUserID(uid, done);
  }

  function checkPubkeyUnicity (block, done) {
    async.forEach(block.identities, function(inlineIdentity, callback){
      var idty = Identity.statics.fromInline(inlineIdentity);
      async.waterfall([
        function (next){
          checkExistsPubkey(idty.pubkey, next);
        },
        function (exists, next){
          next(exists ? 'Pubkey already used' : null);
        }
      ], callback);
    }, done);
  }

  function checkExistsPubkey(pubkey, done) {
    dao.existsPubkey(pubkey, done);
  }

  function checkIssuerIsMember (block, done) {
    async.waterfall([
      function (next){
        if (block.number == 0)
          isMember(block, block.issuer, next);
        else
          dao.isMember(block.issuer, next);
      },
      function (isMember, next) {
        if (!isMember) {
          next('Issuer is not a member');
          return;
        }
        next();
      }
    ], done);
  }

  function checkJoiners (block, done) {
    async.forEachSeries(block.joiners, function(inlineMS, callback){
      var ms = Membership.statics.fromInline(inlineMS);
      async.waterfall([
        function (next){
          checkMSTarget(ms, block, next);
        },
        function (next){
          dao.getCurrentMembershipNumber(ms.issuer, next);
        },
        function (msNumber, next) {
          if (msNumber != -1 && msNumber >= ms.number) {
            next('Membership\'s number must be greater than last membership of the pubkey');
            return;
          }
          dao.isMember(ms.issuer, next);
        },
        function (isMember, next) {
          if (isMember) {
            next('Cannot be in joiners if already a member');
            return;
          }
          next();
        }
      ], callback);
    }, done);
  }

  function checkActives (block, done) {
    async.forEachSeries(block.actives, function(inlineMS, callback){
      var ms = Membership.statics.fromInline(inlineMS);
      async.waterfall([
        function (next){
          checkMSTarget(ms, block, next);
        },
        function (next){
          dao.getCurrentMembershipNumber(ms.issuer, next);
        },
        function (msNumber, next) {
          if (msNumber != -1 && msNumber >= ms.number) {
            next('Membership\'s number must be greater than last membership of the pubkey');
            return;
          }
          dao.isMember(ms.issuer, next);
        },
        function (isMember, next) {
          if (!isMember) {
            next('Cannot be in actives if not a member');
            return;
          }
          next();
        }
      ], callback);
    }, done);
  }

  function checkLeavers (block, done) {
    async.forEachSeries(block.leavers, function(inlineMS, callback){
      var ms = Membership.statics.fromInline(inlineMS);
      async.waterfall([
        function (next){
          checkMSTarget(ms, block, next);
        },
        function (next){
          dao.getCurrentMembershipNumber(ms.issuer, next);
        },
        function (msNumber, next) {
          if (msNumber != -1 && msNumber >= ms.number) {
            next('Membership\'s number must be greater than last membership of the pubkey');
            return;
          }
          dao.isMember(ms.issuer, next);
        },
        function (isMember, next) {
          if (!isMember) {
            next('Cannot be in leavers if not a member');
            return;
          }
          next();
        }
      ], callback);
    }, done);
  }

  function checkExcluded (block, done) {
    async.forEachSeries(block.excluded, function(pubkey, callback){
      async.waterfall([
        function (next){
          dao.isMember(pubkey, next);
        },
        function (isMember, next) {
          if (!isMember) {
            next('Cannot be in excluded if not a member');
            return;
          }
          next();
        }
      ], callback);
    }, done);
  }

  function checkMSTarget (ms, block, done) {
    if (block.number == 0 && ms.number != 0) {
      done('Number must be 0 for root block\'s memberships');
    }
    else if (block.number == 0 && ms.fpr != 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855') {
      done('Hash must be E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855 for root block\'s memberships');
    }
    else if (block.number == 0) {
      done(); // Valid for root block
    } else {
      async.waterfall([
        function (next) {
          dao.findBlock(ms.number, ms.fpr, function (err, basedBlock) {
            next(err || (basedBlock == null && 'Membership based on an unexisting block') || null, basedBlock);
          });
        },
        function (basedBlock, next) {
          async.parallel({
            target: function (next) {
              next(null, basedBlock);
            },
            current: function (next) {
              if (block.number == 0)
                next(null, null);
              else
                dao.getCurrent(next);
            }
          }, next);
        },
        function (res, next) {
          if (res.current && res.current.medianTime > res.target.medianTime + conf.msValidity) {
            next('Membership has expired');
          }
          else next();
        }
      ], done);
    }
  }

  function checkCertificationsDelayIsRespected (block, done) {
    async.forEach(block.certifications, function(inlineCert, callback){
      var cert = Certification.statics.fromInline(inlineCert);
      async.waterfall([
        function (next){
          dao.getPreviousLinkFor(cert.from, cert.to, next);
        },
        function (previous, next){
          var duration = previous && (block.medianTime - parseInt(previous.timestamp));
          if (previous && (duration <= conf.sigDelay + conf.sigValidity)) {
            next('Too early for this certification');
          } else {
            next();
          }
        },
      ], callback);
    }, done);
  }

  function checkCertificationsPeriodIsRespected (block, done) {
    return co(function *() {
      let current = yield Q.nbind(dao.getCurrent, dao)();
      for (let i = 0, len = block.certifications.length; i < len; i++) {
        let cert = Certification.statics.fromInline(block.certifications[i]);
        let previous = yield dao.getPreviousLinkFrom(cert.from);
        if (previous) {
          let duration = current.medianTime - parseInt(previous.timestamp);
          if (duration < conf.sigPeriod) {
            let stock = yield Q.nbind(dao.getValidLinksFrom, dao)(cert.from);
            if (stock >= conf.sigStock) {
              throw 'Previous certification is not chainable yet';
            }
          }
        }
      }
    })
      .then(() => done())
      .catch(done);
  }

  function checkJoinersAreNotRevoked (block, done) {
    async.forEachSeries(block.joiners, function (inlineMS, callback) {
      async.waterfall([
        function (next) {
          var ms = Membership.statics.fromInline(inlineMS);
          getGlobalIdentity(block, ms.issuer, next); // Have to throw an error if no identity exists
        },
        function (idty, next) {
          if (idty && idty.revoked) {
            next('Revoked pubkeys cannot join');
            return;
          }
          next();
        }
      ], callback);
    }, done);
  }

  function checkJoinersHaveUniqueIdentity (block, done) {
    async.forEachSeries(block.joiners, function (inlineMS, callback) {
      async.waterfall([
        function (next) {
          var ms = Membership.statics.fromInline(inlineMS);
          getGlobalIdentity(block, ms.issuer, next); // Have to throw an error if no identity exists
        },
        function (idty, next) {
          if (!idty) {
            next('Identity does not exist for joiner');
            return;
          }
          next();
        }
      ], callback);
    }, done);
  }

  function checkJoinersHaveEnoughCertifications (block, done) {
    checkPeopleHaveEnoughCertifications(block.joiners, block, done);
  }

  function checkJoinersAreNotOudistanced (block, done) {
    checkPeopleAreNotOudistanced(
      block.joiners.map((inlineMS) => Membership.statics.fromInline(inlineMS).issuer),
      getNewLinks(block),
      block.identities.map((inline) => Identity.statics.fromInline(inline).pubkey),
      done);
  }

  function checkActivesAreNotOudistanced (block, done) {
    checkPeopleAreNotOudistanced(
      block.actives.map((inlineMS) => Membership.statics.fromInline(inlineMS).issuer),
      getNewLinks(block),
      block.identities.map((inline) => Identity.statics.fromInline(inline).pubkey),
      done);
  }

  function checkPeopleHaveEnoughCertifications (memberships, block, done) {
    var newLinks = getNewLinks(block);
    async.forEach(memberships, function(inlineMembership, callback){
      var ms = Membership.statics.fromInline(inlineMembership);
      if (block.number == 0) {
        // No test for root block
        callback();
        return;
      }
      else {
        async.waterfall([
          function (next){
            dao.getValidLinksTo(ms.issuer, next);
          },
          function (links, next){
            var nbCerts = links.length + (newLinks[ms.issuer] || []).length;
            if (nbCerts < conf.sigQty)
              next('Joiner/Active does not gathers enough certifications');
            else
              next();
          },
        ], callback);
      }
    }, done);
  }

  function getNodeIDfromPubkey(nodesCache, pubkey) {
    return co(function *() {
      let toNode = nodesCache[pubkey];
      // Eventually cache the target nodeID
      if (toNode === null || toNode === undefined) {
        let idty = yield Q.nbind(dao.getIdentityByPubkey, dao)(pubkey);
        toNode = idty.wotb_id;
        nodesCache[pubkey] = toNode;
      }
      return toNode;
    });
  }

  function checkPeopleAreNotOudistanced (pubkeys, newLinks, newcomers, done) {
    return co(function *() {
      let current = yield Q.nbind(dao.getCurrent, dao)();
      let membersCount = current ? current.membersCount : 0;
      // TODO: make a temporary copy of the WoT in RAM
      // We add temporarily the newcomers to the WoT, to integrate their new links
      let nodesCache = newcomers.reduce((map, pubkey) => {
        let nodeID = wotb.addNode();
        map[pubkey] = nodeID;
        wotb.setEnabled(false, nodeID); // These are not members yet
        return map;
      }, {});
      // Add temporarily the links to the WoT
      let tempLinks = [];
      let toKeys = _.keys(newLinks);
      for (let i = 0, len = toKeys.length; i < len; i++) {
        let toKey = toKeys[i];
        let toNode = yield getNodeIDfromPubkey(nodesCache, toKey);
        for (let j = 0, len2 = newLinks[toKey].length; j < len2; j++) {
          let fromKey = newLinks[toKey][j];
          let fromNode = yield getNodeIDfromPubkey(nodesCache, fromKey);
          tempLinks.push({ from: fromNode, to: toNode });
        }
      }
      tempLinks.forEach((link) => wotb.addLink(link.from, link.to));
      // Checking distance of each member against them
      let error;
      for (let i = 0, len = pubkeys.length; i < len; i++) {
        let pubkey = pubkeys[i];
        let nodeID = yield getNodeIDfromPubkey(nodesCache, pubkey);
        let dSen = Math.ceil(constants.CONTRACT.DSEN_P * Math.exp(Math.log(membersCount) / conf.stepMax));
        let isOutdistanced = wotb.isOutdistanced(nodeID, dSen, conf.stepMax, conf.xpercent);
        if (isOutdistanced) {
          error = 'Joiner/Active is outdistanced from WoT';
          break;
        }
      }
      // Undo temp links/nodes
      tempLinks.forEach((link) => wotb.removeLink(link.from, link.to));
      newcomers.forEach(() => wotb.removeNode());
      if (error) {
        throw error;
      }
      done();
    })
      .catch((err) =>
        done(err));
  }

  function checkKickedMembersAreExcluded (block, done) {
    async.waterfall([
      function (next){
        dao.getToBeKicked(block.number, next);
      },
      function (identities, next){
        var remainingKeys = identities.map(function (idty) {
          return idty.pubkey;
        });
        remainingKeys = _(remainingKeys).difference(block.excluded);
        if (remainingKeys.length > 0) {
          next('All kicked members must be present under Excluded members')
        } else {
          next();
        }
      }
    ], done);
  }

  function checkMembersCountIsGood (block, done) {
    async.waterfall([
      function (next){
        dao.getCurrent(next);
      },
      function (current, next){
        var currentCount = current ? current.membersCount : 0;
        var variation = block.joiners.length - block.excluded.length;
        if (block.membersCount != currentCount + variation)
          next('Wrong members count');
        else
          next();
      },
    ], done);
  }

}

function getNewLinks (block) {
  var newLinks = {};
  block.certifications.forEach(function(inlineCert){
    var cert = Certification.statics.fromInline(inlineCert);
    newLinks[cert.to] = newLinks[cert.to] || [];
    newLinks[cert.to].push(cert.from);
  });
  return newLinks;
}

function CurrencyFilter (currency, onError) {

  stream.Transform.call(this, { objectMode: true });

  var that = this;

  this._write = function (json) {
    if (json && json.currency && json.currency == currency)
      that.push(json);
    else
      onError("Document currency must be '" + currency + "', was '" + json.currency + "'");
    that.push(null);
  };
}

util.inherits(CurrencyFilter, stream.Transform);
