var _             = require('underscore');
var async         = require('async');
var crypto        = require('./crypto');
var common        = require('./common');
var moment        = require('moment');
var mongoose      = require('mongoose');
var logger        = require('./logger')('validator');
var Block         = require('../lib/entity/block');
var Identity      = require('../lib/entity/identity');
var Membership    = mongoose.model('Membership', require('../models/membership'));
var Certification = require('../lib/entity/certification');

module.exports = function (conf, dao) {
  
  return new GlobalValidator(conf, dao);
};

function GlobalValidator (conf, dao) {

  this.checkSingleTransaction = function (tx, done) {
    async.series([
      async.apply(checkSourcesAvailabilityForTransaction, tx)
    ], function (err) {
      done(err);
    });
  };

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

  /**
  * Function for testing constraints.
  * Useful for function signature reason: it won't give any result in final callback.
  */
  function checkTxs (fn) {
    return function (block, done) {
      var txs = block.getTransactions();
      // Check rule against each transaction
      async.forEachSeries(txs, fn, function (err) {
        // Only return err as result
        done(err);
      });
    };
  }

  this.isOver3Hops = function (member, wot, newLinks, done) {
    isOver3Hops(member, wot, newLinks, dao, done);
  };

  this.getTrialLevel = function (issuer, done) {
    getTrialLevel(issuer, done);
  };

  this.getPoWMin = function (blockNumber, done) {
    getPoWMinFor(blockNumber, done);
  };

  this.getMedianTime = function (blockNumber, done) {
    getMedianTime(blockNumber, done);
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

  function checkCertificationIsValid (block, cert, findIdtyFunc, done) {
    async.waterfall([
      function (next) {
        if (block.number == 0 && cert.block_number != 0) {
          next('Number must be 0 for root block\'s certifications');
        } else if (block.number == 0 && cert.block_number == 0) {
          next(null, { hash: 'DA39A3EE5E6B4B0D3255BFEF95601890AFD80709', medianTime: moment.utc().startOf('minute').unix() }); // Valid for root block
        } else {
          dao.getBlock(cert.block_number, function (err, basedBlock) {
            next(err && 'Certification based on an unexisting block', basedBlock);
          });
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
        else if (res.current && res.current.medianTime > res.target.medianTime + conf.sigValidity) {
          next('Certification has expired');
        }
        else if (cert.from == res.idty.pubkey)
          next('Rejected certification: certifying its own self-certification has no meaning');
        else {
          var selfCert = new Identity(res.idty).selfCert();
          var targetId = [cert.block_number, res.target.hash].join('-');
          crypto.isValidCertification(selfCert, res.idty.sig, cert.from, cert.sig, targetId, next);
        }
      },
    ], done);
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
        getPoWMinFor(block.number, next);
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
    ], done);
  }

  /**
  * Deduce the PoWMin field for a given block number
  */
  function getPoWMinFor (blockNumber, done) {
    if (blockNumber == 0) {
      done('Cannot deduce PoWMin for block#0');
    } else if (blockNumber % conf.dtDiffEval != 0) {
      async.waterfall([
        function (next) {
          // Find dao
          dao.getBlock(blockNumber - 1, next);
        },
        function (previous, next) {
          next(null, previous.powMin);
        }
      ], done);
    } else {
      async.waterfall([
        function (next){
          async.parallel({
            previous: function (next) {
              dao.getBlock(blockNumber - 1, next);
            },
            medianTime: function (next) {
              // Get Mediant time for "blockNumber"
              getMedianTime(blockNumber, next);
            },
            lastDistant: function (next) {
              dao.getBlock(blockNumber - conf.dtDiffEval, next);
            }
          }, next);
        },
        function (res, next){
          // Compute PoWMin value
          var duration = res.medianTime - res.lastDistant.medianTime;
          var speed = conf.dtDiffEval*1.0 / duration*1.0;
          var maxGenTime = conf.avgGenTime * 4;
          var minGenTime = conf.avgGenTime / 4;
          var maxSpeed = 1.0 / minGenTime;
          var minSpeed = 1.0 / maxGenTime;
          // logger.debug('Current speed is', speed, '(' + conf.dtDiffEval + '/' + duration + ')', 'and must be [', minSpeed, ';', maxSpeed, ']');
          if (speed >= maxSpeed) {
            // Must increase difficulty
            next(null, res.previous.powMin + 1);
          }
          else if (speed <= minSpeed) {
            // Must decrease difficulty
            next(null, Math.max(0, res.previous.powMin - 1));
          }
          else {
            // Must not change difficulty
            next(null, res.previous.powMin);
          }
        },
      ], done);
    }
  }

  function checkProofOfWork (block, done) {
    // Compute exactly how much zeros are required for this block's issuer
    async.waterfall([
      function (next){
        getTrialLevel(block.issuer, next);
      },
      function (nbZeros, next){
        var powRegexp = new RegExp('^0{' + nbZeros + ',}');
        if (!block.hash.match(powRegexp))
          next('Wrong proof-of-work level: given ' + block.hash.match(/^0*/)[0].length + ' zeros, required was ' + nbZeros + ' zeros');
        else {
          next();
        }
      },
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
      done(null, 0);
      return;
    }
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
        if (blocksCount % 2 == 0) {
          // Even number of blocks
          var middle = blocksCount / 2;
          times = [timeValues[middle - 1], timeValues[middle]];
          // console.log('middle', middle);
          // console.log('times = ', times);
        }
        else {
          // Odd number of blocks
          var middle = (blocksCount - 1) / 2;
          times = [timeValues[middle]];
          // console.log('middle', middle);
          // console.log('times = ', times);
        }
        // Content
        if (times.length == 2) {
          // Even number of times
          median = Math.ceil((times[0] + times[1]) / 2);
          next(null, median);
        }
        else if (times.length == 1) {
          // Odd number of times
          median = times[0];
          next(null, median);
        }
        else {
          next('No block found for MedianTime comparison');
        }
      }
    ], done);
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
        var UDt1 = Math.ceil(Math.max(UD, c * M / Nt1));
        if (!current && block.dividend) {
          next('Root block cannot have UniversalDividend field');
        }
        else if (current && block.medianTime >= lastUDTime + conf.dt && !block.dividend) {
          next('Block must have a UniversalDividend field');
        }
        else if (current && block.medianTime >= lastUDTime + conf.dt && block.dividend != UDt1) {
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
                dao.lastBlocksOfIssuer(issuer, 1, next);
              },
              powMin: function (next) {
                getPoWMinFor(current.number + 1, next);
              }
            }, function (err, res) {
              next(err, res);
            });
          },
          function (res, next){
            powMin = res.powMin;
            last = (res.lasts && res.lasts[0]) || null;
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
            var nbZeros = Math.max(powMin, powMin * Math.floor(percentRot * (1 + nbPreviousIssuers) / (1 + nbBlocksSince)));
            next(null, nbZeros);
          }
        ], next);
      }
    ], done);
  }

  function checkIdentityUnicity (block, done) {
    async.forEach(block.identities, function(inlineIdentity, callback){
      var idty = Identity.statics.fromInline(inlineIdentity);
      async.waterfall([
        function (next){
          dao.existsUserID(idty.uid, next);
        },
        function (exists, next){
          next(exists ? 'Identity already used' : null);
        },
      ], callback);
    }, done);
  }

  function checkPubkeyUnicity (block, done) {
    async.forEach(block.identities, function(inlineIdentity, callback){
      var idty = Identity.statics.fromInline(inlineIdentity);
      async.waterfall([
        function (next){
          dao.existsPubkey(idty.pubkey, next);
        },
        function (exists, next){
          next(exists ? 'Pubkey already used' : null);
        },
      ], callback);
    }, done);
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
      var ms = Membership.fromInline(inlineMS);
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
      var ms = Membership.fromInline(inlineMS);
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
      var ms = Membership.fromInline(inlineMS);
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
    else if (block.number == 0 && ms.fpr != 'DA39A3EE5E6B4B0D3255BFEF95601890AFD80709') {
      done('Hash must be DA39A3EE5E6B4B0D3255BFEF95601890AFD80709 for root block\'s memberships');
    }
    else if (block.number == 0) {
      done(); // Valid for root block
    } else {
      async.waterfall([
        function (next) {
          dao.findBlock(ms.number, ms.fpr, function (err, basedBlock) {
            next(err || (basedBlock == null && 'Membership based on an unexisting block') || null, basedBlock);
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
          if (previous && (duration < conf.sigDelay)) {
            next('Too early for this certification');
          } else {
            next();
          }
        },
      ], callback);
    }, done);
  }

  function checkJoinersAreNotRevoked (block, done) {
    async.forEachSeries(block.joiners, function (inlineMS, callback) {
      async.waterfall([
        function (next) {
          var ms = Membership.fromInline(inlineMS);
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
          var ms = Membership.fromInline(inlineMS);
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
    checkPeopleAreNotOudistanced(block.joiners, block, done);
  }

  function checkActivesAreNotOudistanced (block, done) {
    checkPeopleAreNotOudistanced(block.actives, block, done);
  }

  function checkPeopleHaveEnoughCertifications (memberships, block, done) {
    var newLinks = getNewLinks(block);
    async.forEach(memberships, function(inlineMembership, callback){
      var ms = Membership.fromInline(inlineMembership);
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

  function checkPeopleAreNotOudistanced (memberships, block, done) {
    var wotPubkeys = [];
    async.waterfall([
      function (next){
        dao.getMembersWithEnoughSigWoT(conf.sigWoT, next);
      },
      function (identities, next){
        // Stacking WoT pubkeys
        identities.forEach(function(idty){
          wotPubkeys.push(idty.pubkey);
        });
        var newLinks = getNewLinks(block);
        // Checking distance of each member against them
        async.forEach(memberships, function(inlineMembership, callback){
          var ms = Membership.fromInline(inlineMembership);
          async.waterfall([
            function (next){
              isOver3Hops(ms.issuer, wotPubkeys, newLinks, dao, next);
            },
            function (outdistancedCount, next){
              if (outdistancedCount.length > 0)
                next('Joiner/Active is outdistanced from WoT');
              else
                next();
            },
          ], callback);
        }, next);
      },
    ], done);
  }

  function checkKickedMembersAreExcluded (block, done) {
    var wotPubkeys = [];
    async.waterfall([
      function (next){
        dao.getToBeKicked(block.number, next);
      },
      function (identities, next){
        var remainingKeys = [];
        identities.forEach(function (idty) {
          remainingKeys.push(idty.pubkey);
        });
        block.excluded.forEach(function (excluded) {
          remainingKeys = _(remainingKeys).difference(excluded);
        });
        if (remainingKeys.length > 0) {
          next('All kicked members must be present under Excluded members')
        } else {
          next();
        }
      },
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

function isOver3Hops (pubkey, ofMembers, newLinks, dao, done) {
  var newCertifiers = newLinks[pubkey] || [];
  var remainingKeys = ofMembers.slice();
  // Without self
  remainingKeys = _(remainingKeys).difference([pubkey]);
  var dist1Links = [];
  async.waterfall([
    function (next){
      // Remove direct links (dist 1)
      remainingKeys = _(remainingKeys).difference(newCertifiers);
      next();
    },
    function (next) {
      if (remainingKeys.length > 0) {
        async.waterfall([
          function (next){
            dao.getValidLinksTo(pubkey, next);
          },
          function (links, next){
            dist1Links = [];
            links.forEach(function(lnk){
              dist1Links.push(lnk.source);
            });
            // Add new certifiers as distance 1 links
            dist1Links = _(dist1Links.concat(newCertifiers)).uniq();
            next();
          },
        ], next);
      }
      else next();
    },
    function (next){
      // Remove distance 2 links (those for whom new links make 1 distance)
      var found = [];
      if (remainingKeys.length > 0) {
        async.forEachSeries(remainingKeys, function(member, callback){
          // Exists distance 1 link?
          async.detect(dist1Links, function (dist1member, callbackDist1) {
            // Look in newLinks
            var signatories = (newLinks[dist1member] || []);
            if (~signatories.indexOf(member)) {
              callbackDist1(true);
              return;
            }
            // dist1member signed 'pubkey', so here we look for (member => dist1member => pubkey sigchain)
            dao.getPreviousLinkFromTo(member, dist1member, function (err, links) {
              if (links && links.length > 0) {
                found.push(member);
                callbackDist1(true);
              }
              else callbackDist1(false);
            });
          }, function (detected) {
            if (detected)
              found.push(member);
            callback();
          });
        }, function(err){
          remainingKeys = _(remainingKeys).difference(found);
          next(err);
        });
      }
      else next();
    },
    function (next){
      // Remove distance 3 links (those for whom new links make 2 distance)
      var found = [];
      if (remainingKeys.length > 0) {
        async.forEachSeries(remainingKeys, function(member, callback){
          var dist2Links = [];

          async.waterfall([
            function (next){
              // Step 1. Detect distance 1 members from current member (potential dist 2 from 'pubkey')
              // Look in database
              dao.getValidLinksFrom(member, function (err, links) {
                dist2Links = [];
                links.forEach(function(lnk){
                  dist2Links.push(lnk.target);
                });
                next(err);
              });
              // Look in newLinks
              _(newLinks).keys().forEach(function(signed){
                (newLinks[signed] || []).forEach(function(signatories){
                  if (~signatories.indexOf(member)) {
                    dist2Links.push(signed);
                  }
                });
              });
            },
            function (next){
              // Step 2. Detect links between distance 2 & distance 1 members
              async.detect(dist2Links, function (dist2member, callbackDist2) {
                // Exists distance 1 link?
                async.detect(dist1Links, function (dist1member, callbackDist1) {
                  // Look in newLinks
                  var signatories = (newLinks[dist1member] || []);
                  if (~signatories.indexOf(dist2member)) {
                    callbackDist1(true);
                    return;
                  }
                  // dist1member signed 'pubkey', so here we look for (member => dist1member => pubkey sigchain)
                  dao.getPreviousLinkFromTo(dist2member, dist1member, function (err, links) {
                    if (links && links.length > 0) {
                      callbackDist1(true);
                    }
                    else callbackDist1(false);
                  });
                }, callbackDist2);
              }, function (detected) {
                if (detected)
                  found.push(member);
                callback();
              });
            },
          ], callback);
        }, function(err){
          remainingKeys = _(remainingKeys).difference(found);
          next(err);
        });
      }
      else next();
    },
  ], function (err) {
    done(err, remainingKeys);
  });
}