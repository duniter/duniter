var _             = require('underscore');
var async         = require('async');
var crypto        = require('./crypto');
var common        = require('./common');
var mongoose      = require('mongoose');
var Identity      = mongoose.model('Identity', require('../models/identity'));
var Membership    = mongoose.model('Membership', require('../models/membership'));
var Certification = mongoose.model('Certification', require('../models/certification'));

module.exports = function (conf, dao) {
  
  return new GlobalValidator(conf, dao);
};

function GlobalValidator (conf, dao) {

  this.checkSignatures = function (block, done) {
    async.series([
      async.apply(checkCertificationsAreValid, block)
    ], function (err) {
      done(err);
    });
  };

  this.checkProofOfWork = function (block, done) {
    async.series([
      async.apply(checkFingerprint, block)
    ], function (err) {
      done(err);
    });
  };

  this.validate = function (block, done) {
    async.series([
      async.apply(checkNumber, block),
      async.apply(checkPreviousHash, block),
      async.apply(checkPreviousIssuer, block),
      async.apply(checkIdentityUnicity, block),
      async.apply(checkPubkeyUnicity, block),
      async.apply(checkLeaversAreMembers, block),
      async.apply(checkExcludedAreMembers, block),
      async.apply(checkCertificationsAreMadeByMembers, block),
      async.apply(checkCertificationsAreMadeToMembers, block),
      async.apply(checkCertificationsDelayIsRespected, block),
      async.apply(checkJoinersHaveEnoughCertifications, block),
      async.apply(checkJoinersAreNotOudistanced, block),
      async.apply(checkKickedMembersAreExcluded, block),
      async.apply(checkMembersCountIsGood, block)
    ], function (err) {
      done(err);
    });
  };

  this.isOver3Hops = function (member, wot, newLinks, done) {
    isOver3Hops(member, wot, newLinks, dao, done);
  };

  this.getTrialLevel = function (issuer, nextBlockNumber, currentWoTsize, done) {
    getTrialLevel(issuer, nextBlockNumber, currentWoTsize, done);
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
    async.forEach(block.certifications, function(inlineCert, callback){
      var cert = Certification.fromInline(inlineCert);
      async.waterfall([
        function (next){
          getGlobalIdentity(block, cert.to, next);
        },
        function (idty, next){
          var selfCert = idty.selfCert();
          crypto.isValidCertification(selfCert, idty.sig, cert.from, cert.sig, cert.when.timestamp(), next);
        },
      ], callback);
    }, done);
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

  function checkFingerprint (block, done) {
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
              getTrialLevel(block.issuer, block.number, current ? current.membersCount : 0, next);
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

  function getTrialLevel (issuer, nextBlockNumber, currentWoTsize, done) {
    // Compute exactly how much zeros are required for this block's issuer
    var lastBlockNbZeros = 0;
    var nbWaitedPeriods = 0;
    async.waterfall([
      function (next){
        dao.lastBlockOfIssuer(issuer, next);
      },
      function (last, next){
        if (last) {
          lastBlockNbZeros = last.hash.match(/^0+/)[0].length;
          var powPeriodIsPercentage = conf.powPeriod < 1;
          var nbPeriodsToWait = powPeriodIsPercentage ? Math.floor(conf.powPeriod*currentWoTsize) : conf.powPeriod;
          if (nbPeriodsToWait == 0)
            nbWaitedPeriods = 1; // Minorate by 1 if does not have to wait
          else
            nbWaitedPeriods = Math.floor((nextBlockNumber - last.number) / nbPeriodsToWait); // -1 to say "excluded"
        }
        var nbZeros = Math.max(conf.powZeroMin, lastBlockNbZeros + 1 - nbWaitedPeriods);
        next(null, nbZeros);
      },
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

  function checkLeaversAreMembers (block, done) {
    done();
  }

  function checkExcludedAreMembers (block, done) {
    done();
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

  function checkJoinersHaveEnoughCertifications (block, done) {
    var newLinks = getNewLinks(block);
    async.forEach(block.joiners, function(inlineMembership, callback){
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
              next('Joiner does not gathers enough certifications');
            else
              next();
          },
        ], callback);
      }
    }, done);
  }

  function checkJoinersAreNotOudistanced (block, done) {
    var wotPubkeys = [];
    async.waterfall([
      function (next){
        dao.getMembers(next);
      },
      function (identities, next){
        // Stacking WoT pubkeys
        identities.forEach(function(idty){
          wotPubkeys.push(idty.pubkey);
        });
        var newLinks = getNewLinks(block);
        // Checking distance of each member against them
        async.forEach(block.joiners, function(inlineMembership, callback){
          var ms = Membership.fromInline(inlineMembership);
          async.waterfall([
            function (next){
              isOver3Hops(ms.issuer, wotPubkeys, newLinks, dao, next);
            },
            function (outdistancedCount, next){
              if (outdistancedCount.length > 0)
                next('Joiner is outdistanced from WoT');
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