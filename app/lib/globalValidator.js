var _             = require('underscore');
var async         = require('async');
var crypto        = require('./crypto');
var common        = require('./common');
var moment        = require('moment');
var mongoose      = require('mongoose');
var Identity      = mongoose.model('Identity', require('../models/identity'));
var Membership    = mongoose.model('Membership', require('../models/membership'));
var Certification = mongoose.model('Certification', require('../models/certification'));

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
    { name: 'checkDates',                           func: check(checkDates)                           },
    { name: 'checkIdentityUnicity',                 func: check(checkIdentityUnicity)                 },
    { name: 'checkPubkeyUnicity',                   func: check(checkPubkeyUnicity)                   },
    { name: 'checkJoiners',                         func: check(checkJoiners)                         },
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
    { name: 'checkCertificationsDelayIsRespected',  func: check(checkCertificationsDelayIsRespected)  },
    { name: 'checkMembersCountIsGood',              func: check(checkMembersCountIsGood)              },
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
      testFunctionsPrepared.push(async.apply(obj.func, block));
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
          next(null, Identity.fromInline(localInlineIdty));
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
        if (block.isLeaving(pubkey)) {
          next(null, false);
        } else if (block.isJoining(pubkey)) {
          next(null, true);
        } else {
          dao.isMember(pubkey, next);
        }
      },
    ], done);
  }

  function checkCertificationsAreValid (block, done) {
    async.forEachSeries(block.certifications, function(inlineCert, callback){
      var cert = Certification.fromInline(inlineCert);
      checkCertificationIsValid(block, cert, getGlobalIdentity, callback);
    }, done);
  }

  function checkCertificationIsValid (block, cert, findIdtyFunc, done) {
    async.waterfall([
      function (next) {
        if (block.number == 0 && cert.block_number != 0) {
          next('Number must be 0 for root block\'s certifications');
        } else if (block.number == 0 && cert.block_number == 0) {
          next(null, { hash: 'DA39A3EE5E6B4B0D3255BFEF95601890AFD80709', confirmedDate: moment.utc().startOf('minute').unix() }); // Valid for root block
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
        else if (res.current && res.current.confirmedDate > res.target.confirmedDate + conf.sigValidity) {
          next('Certification has expired');
        }
        else if (cert.from == res.idty.pubkey)
          next('Rejected certification: certifying its own self-certification has no meaning');
        else {
          var selfCert = res.idty.selfCert();
          var targetId = [cert.block_number, res.target.hash].join('-');
          crypto.isValidCertification(selfCert, res.idty.sig, cert.from, cert.sig, targetId, next);
        }
      },
    ], done);
  }

  function checkCertificationsAreMadeByMembers (block, done) {
    async.forEach(block.certifications, function(inlineCert, callback){
      var cert = Certification.fromInline(inlineCert);
      async.waterfall([
        function (next){
          isMember(block, cert.from, next);
        },
        function (idty, next){
          next(idty ? null : 'Certification from non-member');
        },
      ], callback);
    }, done);
  }

  function checkCertificationsAreMadeToMembers (block, done) {
    async.forEach(block.certifications, function(inlineCert, callback){
      var cert = Certification.fromInline(inlineCert);
      async.waterfall([
        function (next){
          isMember(block, cert.to, next);
        },
        function (idty, next){
          next(idty ? null : 'Certification to non-member');
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

  function checkProofOfWork (block, done) {
    async.waterfall([
      function (next){
        dao.getCurrent(next);
      },
      function (current, next){
        var powRegexp = new RegExp('^0{' + conf.powZeroMin + '}');
        if (!block.hash.match(powRegexp))
          next('Not a proof-of-work');
        else {
          // Compute exactly how much zeros are required for this block's issuer
          var lastBlockPenality = 0;
          var nbWaitedPeriods = 0;
          async.waterfall([
            function (next){
              getTrialLevel(block.issuer, next);
            },
            function (nbZeros, next){
              var powRegexp = new RegExp('^0{' + nbZeros + ',}');
              if (!block.hash.match(powRegexp))
                next('Wrong proof-of-work level: given ' + block.hash.match(/^0+/)[0].length + ' zeros, required was ' + nbZeros + ' zeros');
              else {
                next();
              }
            },
          ], next);
        }
      },
    ], done);
  }

  function checkDates (block, done) {
    async.waterfall([
      function (next){
        dao.getCurrent(next);
      },
      function (current, next){
        if (!current && block.date != block.confirmedDate) {
          next('Root block\'s Date and ConfirmedDate must be equal');
        }
        else if (current && block.date < current.confirmedDate) {
          next('Date field cannot be lower than previous block\'s ConfirmedDate');
        }
        else if (current && current.newDateNth + 1 == conf.incDateMin && block.date == current.date && block.confirmedDate != block.date) {
          next('ConfirmedDate must be equal to Date for a confirming block');
        }
        else if (current && !(current.newDateNth + 1 == conf.incDateMin && block.date == current.date) && block.confirmedDate != current.confirmedDate) {
          next('ConfirmedDate must be equal to previous block\'s ConfirmedDate');
        }
        else {
          next();
        }
      },
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
        var lastUDTime = res.lastUDBlock ? res.lastUDBlock.confirmedDate : (root != null ? root.confirmedDate : 0);
        var UD = res.lastUDBlock ? res.lastUDBlock.dividend : conf.ud0;
        var M = res.lastUDBlock ? res.lastUDBlock.monetaryMass : 0;
        var Nt1 = block.membersCount;
        var c = conf.c;
        var UDt1 = Math.ceil(Math.max(UD, c * M / Nt1));
        if (!current && block.dividend) {
          next('Root block cannot have UniversalDividend field');
        }
        else if (current && current.confirmedDateChanged && block.confirmedDate >= lastUDTime + conf.dt && !block.dividend) {
          next('Block must have a UniversalDividend field');
        }
        else if (current && current.confirmedDateChanged && block.confirmedDate >= lastUDTime + conf.dt && block.dividend != UDt1) {
          next('UniversalDividend must be equal to ' + UDt1);
        }
        else if (current && !current.confirmedDateChanged && block.dividend) {
          next('This block cannot have UniversalDividend since ConfirmedDate has not changed');
        }
        else if (current && current.confirmedDateChanged && block.confirmedDate < lastUDTime + conf.dt && block.dividend) {
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
    var lastBlockNbZeros = 0;
    var interBlocksCount = 0;
    var followingBlocksCount = 0;
    async.waterfall([
      function (next){
        async.parallel({
          lasts: function (next) {
            dao.last2BlocksOfIssuer(issuer, next);
          },
          current: function (next) {
            dao.getCurrent(next);
          },
          last10: function (next) {
            dao.getLastBlocks(11, next);
          }
        }, function (err, res) {
          next(err, res);
        });
      },
      function (res, next){
        var current = res.current;
        var lasts = res.lasts;
        if (current && lasts && lasts.length > 0) {
          // Nb zeros of last block
          lastBlockNbZeros = lasts[0].hash.match(/^0+/)[0].length;
          // Nb following blocks since last
          followingBlocksCount = Math.abs(lasts[0].number - current.number);
          if (lasts.length == 1) {
            // Number of issuers since last 10 blocks
            var issuers = [];
            var last10beforeCurrent = res.last10.splice(1);
            last10beforeCurrent.forEach(function (block) {
              if (issuers.indexOf(block.issuer) == -1) {
                issuers.push(block.issuer);
              }
            });
            interBlocksCount = issuers.length;
            next();
          } else {
            // Number of different issuers between 2 last blocks of issuer
            async.waterfall([
              function (next) {
                //----- Interblocks -----
                var issuers = [];
                var i = lasts[0].number - 1; // Start excluding last block of issuer
                async.whilst(
                  function(){ return i > lasts[1].number && issuers.length < 40 - conf.powZeroMin; }, // End exluding first block of issuer
                  function (next) {
                    async.waterfall([
                      function (next){
                        dao.getBlock(i, next);
                      },
                      function (block, next){
                        if (issuers.indexOf(block.issuer) == -1) {
                          issuers.push(block.issuer);
                        }
                        i--;
                        next();
                      },
                    ], next);
                  }, function (err) {
                    interBlocksCount = issuers.length;
                    next();
                  });
              },
              function (next) {
                //----- Following blocks -----
                var issuers = [];
                var neededMax = interBlocksCount;
                var i = current.number; // Start INCLUDING current number
                async.whilst(
                  function(){ return i > lasts[0].number && issuers.length < neededMax; }, // End exluding last block, stop if reaches 0 difficulty
                  function (next) {
                    async.waterfall([
                      function (next){
                        dao.getBlock(i, next);
                      },
                      function (block, next){
                        if (issuers.indexOf(block.issuer) == -1) {
                          issuers.push(block.issuer);
                        }
                        i--;
                        next();
                      },
                    ], next);
                  }, function (err) {
                    followingBlocksCount = issuers.length;
                    next();
                  });
              }
            ], next);
          }
        }
        else next(); // No block for issuer
      },
      function (next) {
        var nbZeros = Math.max(conf.powZeroMin, lastBlockNbZeros + interBlocksCount - followingBlocksCount);
        next(null, nbZeros);
      }
    ], done);
  }

  function checkIdentityUnicity (block, done) {
    async.forEach(block.identities, function(inlineIdentity, callback){
      var idty = Identity.fromInline(inlineIdentity);
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
      var idty = Identity.fromInline(inlineIdentity);
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
          if (msNumber != -1 && msNumber <= ms.number) {
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
          if (msNumber != -1 && msNumber <= ms.number) {
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
          if (msNumber != -1 && msNumber <= ms.number) {
            next('Membership\'s number must be greater than last membership of the pubkey');
            return;
          }
          dao.isMember(ms.issuer, next);
        },
        function (isMember, next) {
          if (isMember) {
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
          if (res.current && res.current.confirmedDate > res.target.confirmedDate + conf.msValidity) {
            next('Membership has expired');
          }
          else next();
        }
      ], done);
    }
  }

  function checkCertificationsDelayIsRespected (block, done) {
    async.forEach(block.certifications, function(inlineCert, callback){
      var cert = Certification.fromInline(inlineCert);
      async.waterfall([
        function (next){
          dao.getPreviousLinkFor(cert.from, cert.to, next);
        },
        function (previous, next){
          var duration = previous && (block.confirmedDate - parseInt(previous.timestamp));
          if (previous && (duration < conf.sigDelay)) {
            next('Too early for this certification');
          } else {
            next();
          }
        },
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
        var variation = block.joiners.length - block.leavers.length - block.excluded.length;
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
    var cert = Certification.fromInline(inlineCert);
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