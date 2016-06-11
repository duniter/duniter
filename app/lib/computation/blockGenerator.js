"use strict";
var async           = require('async');
var _               = require('underscore');
var co              = require('co');
var Q               = require('q');
var moment          = require('moment');
var inquirer        = require('inquirer');
var rawer           = require('../ucp/rawer');
var hashf           = require('../ucp/hashf');
var constants       = require('../constants');
var base58          = require('../crypto/base58');
var rules           = require('../rules/index');
var signature       = require('../crypto/signature');
let keyring          = require('../crypto/keyring');
var Identity        = require('../entity/identity');
var Certification   = require('../entity/certification');
var Membership      = require('../entity/membership');
var Block           = require('../entity/block');
var Transaction     = require('../entity/transaction');

module.exports = (mainContext, prover) => new BlockGenerator(mainContext, prover);

function BlockGenerator(mainContext, prover) {

  var that = this;
  var conf, dal, pair, selfPubkey, logger;

  this.setConfDAL = (newConf, newDAL, newPair) => {
    dal = newDAL;
    conf = newConf;
    pair = newPair;
    selfPubkey = base58.encode(pair.publicKey);
    logger = require('../logger')(dal.profile);
  };

  this.nextBlock = () => generateNextBlock(new NextBlockGenerator(conf, dal));

  this.nextEmptyBlock = () => co(function *() {
    var current = yield dal.getCurrentBlockOrNull();
    var lastUDBlock = dal.lastUDBlock();
    var exclusions = yield dal.getToBeKickedPubkeys();
    return createBlock(current, {}, {}, {}, [], exclusions, lastUDBlock, []);
  });

  this.manualRoot = () => co(function *() {
    let current = yield dal.getCurrentBlockOrNull();
    if (current) {
      throw 'Cannot generate root block: it already exists.';
    }
    return generateNextBlock(new ManualRootGenerator());
  });

  this.makeNextBlock = (block, sigFunc, trial, manualValues) => co(function *() {
    var unsignedBlock = block || (yield that.nextBlock());
    var sigF = sigFunc || signature.sync(pair);
    var trialLevel = trial || (yield rules.HELPERS.getTrialLevel(selfPubkey, conf, dal));
    return prover.prove(unsignedBlock, sigF, trialLevel, null, (manualValues && manualValues.time) || null);
  });

  this.getSinglePreJoinData = getSinglePreJoinData;
  this.computeNewCerts = computeNewCerts;
  this.newCertsToLinks = newCertsToLinks;

  /**
   * Generate next block, gathering both updates & newcomers
   */
  function generateNextBlock(generator) {
    return co(function *() {
      var current = yield dal.getCurrentBlockOrNull();
      var lastUDBlock = yield dal.lastUDBlock();
      var revocations = yield dal.getRevocatingMembers();
      var exclusions = yield dal.getToBeKickedPubkeys();
      var newCertsFromWoT = yield generator.findNewCertsFromWoT(current);
      var newcomersLeavers = yield findNewcomersAndLeavers(current, generator.filterJoiners);
      var transactions = yield findTransactions();
      var joinData = newcomersLeavers[2];
      var leaveData = newcomersLeavers[3];
      var newCertsFromNewcomers = newcomersLeavers[4];
      var certifiersOfNewcomers = _.uniq(_.keys(joinData).reduce(function(certifiers, newcomer) {
        return certifiers.concat(_.pluck(joinData[newcomer].certs, 'from'));
      }, []));
      var certifiers = [].concat(certifiersOfNewcomers);
      // Merges updates
      _(newCertsFromWoT).keys().forEach(function(certified){
        newCertsFromWoT[certified] = newCertsFromWoT[certified].filter(function(cert) {
          // Must not certify a newcomer, since it would mean multiple certifications at same time from one member
          var isCertifier = certifiers.indexOf(cert.from) != -1;
          if (!isCertifier) {
            certifiers.push(cert.from);
          }
          return !isCertifier;
        });
      });
      _(newCertsFromNewcomers).keys().forEach(function(certified){
        newCertsFromWoT[certified] = (newCertsFromWoT[certified] || []).concat(newCertsFromNewcomers[certified]);
      });
      // Revocations
      // Create the block
      return createBlock(current, joinData, leaveData, newCertsFromWoT, revocations, exclusions, lastUDBlock, transactions);
    });
  }

  function findNewcomersAndLeavers (current, filteringFunc) {
    return Q.Promise(function(resolve, reject){
      async.parallel({
        newcomers: function(callback){
          findNewcomers(current, filteringFunc, callback);
        },
        leavers: function(callback){
          findLeavers(current, callback);
        }
      }, function(err, res) {
        var current = res.newcomers[0];
        var newWoTMembers = res.newcomers[1];
        var finalJoinData = res.newcomers[2];
        var updates = res.newcomers[3];
        err ? reject(err) : resolve([current, newWoTMembers, finalJoinData, res.leavers, updates]);
      });
    });
  }

  function findTransactions() {
    return dal.getTransactionsPending()
      .then(function (txs) {
        var transactions = [];
        var passingTxs = [];
        return Q.Promise(function(resolve, reject){

          async.forEachSeries(txs, function (rawtx, callback) {
            var tx = new Transaction(rawtx, conf.currency);
            var extractedTX = tx.getTransaction();
            async.waterfall([
              function (next) {
                rules.HELPERS.checkBunchOfTransactions(passingTxs.concat(extractedTX), next);
              },
              function (next) {
                rules.HELPERS.checkSingleTransaction(extractedTX, { medianTime: moment().utc().unix() }, conf, dal).then(() => next()).catch(next);
              },
              function (next) {
                transactions.push(tx);
                passingTxs.push(extractedTX);
                next();
              }
            ], function (err) {
              if (err) {
                logger.error(err);
                dal.removeTxByHash(extractedTX.hash).then(_.partial(callback, null)).catch(callback);
              }
              else {
                logger.info('Transaction added to block');
                callback();
              }
            });
          }, function(err) {
            err ? reject(err) : resolve(transactions);
          });
        });
      });
  }

  function findLeavers (current, done) {
    var leaveData = {};
    async.waterfall([
      function (next){
        dal.findLeavers().then(_.partial(next, null)).catch(next);
      },
      function (mss, next){
        var leavers = [];
        mss.forEach(function (ms) {
          leavers.push(ms.issuer);
        });
        async.forEach(mss, function(ms, callback){
          var leave = { identity: null, ms: ms, key: null, idHash: '' };
          leave.idHash = (hashf(ms.userid + ms.certts + ms.issuer) + "").toUpperCase();
          async.waterfall([
            function (next){
              async.parallel({
                block: function (callback) {
                  if (current) {
                    dal.getBlockOrNull(ms.number, function (err, basedBlock) {
                      callback(null, err ? null : basedBlock);
                    });
                  } else {
                    callback(null, {});
                  }
                },
                identity: function(callback){
                  dal.getIdentityByHashOrNull(leave.idHash, callback);
                }
              }, next);
            },
            function (res, next){
              if (res.identity && res.block && res.identity.currentMSN < leave.ms.number && res.identity.member) {
                // MS + matching cert are found
                leave.identity = res.identity;
                leaveData[res.identity.pubkey] = leave;
              }
              next();
            }
          ], callback);
        }, next);
      },
      function (next) {
        next(null, leaveData);
      }
    ], done);
  }

  function findNewcomers (current, filteringFunc, done) {
    var wotMembers = [];
    var joinData = {};
    var updates = {};
    async.waterfall([
      function (next) {
        getPreJoinData(current, next);
      },
      function (preJoinData, next){
        filteringFunc(preJoinData, next);
      },
      function (filteredJoinData, next) {
        joinData = filteredJoinData;
        // Cache the members
        dal.getMembers(next);
      },
      function (members, next) {
        wotMembers = _.pluck(members, 'pubkey');
        // Checking step
        var newcomers = _(joinData).keys();
        var nextBlockNumber = current ? current.number + 1 : 0;
        // Checking algo is defined by 'checkingWoTFunc'
        iteratedChecking(newcomers, function (someNewcomers, onceChecked) {
          var nextBlock = {
            number: nextBlockNumber,
            joiners: someNewcomers,
            identities: _.filter(newcomers.map((pub) => joinData[pub].identity), { wasMember: false }).map((idty) => idty.pubkey)
          };
          // Check WoT stability
          async.waterfall([
            function (next){
              computeNewLinks(nextBlockNumber, someNewcomers, joinData, updates, next);
            },
            function (newLinks, next){
              checkWoTConstraints(nextBlock, newLinks, current, next);
            }
          ], (err) => {
            onceChecked(err);
          });
        }, function (err, realNewcomers) {
          err && logger.error(err);
          async.waterfall([
            function (next){
              computeNewLinks(nextBlockNumber, realNewcomers, joinData, updates, next);
            },
            function (newLinks, next){
              var newWoT = wotMembers.concat(realNewcomers);
              next(err, realNewcomers, newLinks, newWoT);
            }
          ], next);
        });
      },
      function (realNewcomers, newLinks, newWoT, next) {
        var finalJoinData = {};
        realNewcomers.forEach(function(newcomer){
          // Only keep membership of selected newcomers
          finalJoinData[newcomer] = joinData[newcomer];
          // Only keep certifications from final members
          var keptCerts = [];
          joinData[newcomer].certs.forEach(function(cert){
            var issuer = cert.from;
            if (~newWoT.indexOf(issuer) && ~newLinks[cert.to].indexOf(issuer)) {
              keptCerts.push(cert);
            }
          });
          joinData[newcomer].certs = keptCerts;
        });
        // Send back the new WoT, the joining data and key updates for newcomers' signature of WoT
        next(null, current, wotMembers.concat(realNewcomers), finalJoinData, updates);
      }
    ], done);
  }

  function checkWoTConstraints (block, newLinks, current, done) {
    return co(function *() {
      if (block.number < 0) {
        throw 'Cannot compute WoT constraint for negative block number';
      }
      let newcomers = block.joiners.map((inlineMS) => inlineMS.split(':')[0]);
      let realNewcomers = block.identities;
      for (let i = 0, len = newcomers.length; i < len; i++) {
        let newcomer = newcomers[i];
        if (block.number > 0) {
          try {
            // Will throw an error if not enough links
            yield Q.nbind(mainContext.checkHaveEnoughLinks, mainContext)(newcomer, newLinks);
            // This one does not throw but returns a boolean
            let isOut = yield rules.HELPERS.isOver3Hops(newcomer, newLinks, realNewcomers, current, conf, dal);
            if (isOut) {
              throw 'Key ' + newcomer + ' is not recognized by the WoT for this block';
            }
          } catch (e) {
            logger.debug(e);
            throw e;
          }
        }
      }
    })
      .then(() => done())
      .catch(done);
  }

  function iteratedChecking(newcomers, checkWoTForNewcomers, done) {
    return Q.Promise(function(resolve){
        var passingNewcomers = [], hadError = false;
        async.forEachSeries(newcomers, function(newcomer, callback){
          checkWoTForNewcomers(passingNewcomers.concat(newcomer), function (err) {
            // If success, add this newcomer to the valid newcomers. Otherwise, reject him.
            if (!err) {
              passingNewcomers.push(newcomer);
            }
            hadError = hadError || err;
            callback();
          });
        }, function(){
          if (hadError) {
            // If at least one newcomer was rejected, test the whole new bunch
            resolve(iteratedChecking(passingNewcomers, checkWoTForNewcomers));
          }
          else {
            resolve(passingNewcomers);
          }
        });
      })
      .then(function(passingNewcomers) {
        done && done(null, passingNewcomers);
        return passingNewcomers;
      })
      .catch(done);
  }

  function getPreJoinData(current, done) {
    var preJoinData = {};
    async.waterfall([
      function (next){
        dal.findNewcomers().then(_.partial(next, null)).catch(next);
      },
      function (mss, next){
        var joiners = [];
        mss.forEach(function (ms) {
          joiners.push(ms.issuer);
        });
        async.forEach(mss, function(ms, callback){
          async.waterfall([
            function(nextOne) {
              return co(function *() {
                if (ms.block != constants.BLOCK.SPECIAL_BLOCK) {
                  let msBasedBlock = yield dal.getBlock(ms.block);
                  let age = current.medianTime - msBasedBlock.medianTime;
                  if (age > conf.msWindow) {
                    throw 'Too old membership';
                  }
                }
              }).then(() => nextOne()).catch(nextOne);
            },
            function(nextOne) {
              var idtyHash = (hashf(ms.userid + ms.certts + ms.issuer) + "").toUpperCase();
              getSinglePreJoinData(current, idtyHash, nextOne, joiners);
            },
            function(join, nextOne) {
              join.ms = ms;
              if (!join.identity.revoked && join.identity.currentMSN < parseInt(join.ms.number)) {
                preJoinData[join.identity.pubkey] = join;
              }
              nextOne();
            }
          ], (err) => {
            if (err) {
              logger.warn(err);
            }
            callback();
          });
        }, next);
      }
    ], function(err) {
      done(err, preJoinData);
    });
  }

  function computeNewLinks (forBlock, theNewcomers, joinData, updates, done) {
    return computeNewLinksP(forBlock, theNewcomers, joinData, updates)
      .catch((err) => {
        done && done(err);
        throw err;
      })
      .then((res) => {
        done && done(null, res);
        return res;
      });
  }

  function computeNewLinksP(forBlock, theNewcomers, joinData, updates) {
    return co(function *() {
      let newCerts = yield computeNewCerts(forBlock, theNewcomers, joinData);
      return newCertsToLinks(newCerts, updates);
    });
  }

  function newCertsToLinks(newCerts, updates) {
    let newLinks = {};
    _.mapObject(newCerts, function(certs, pubkey) {
      newLinks[pubkey] = _.pluck(certs, 'from');
    });
    _.mapObject(updates, function(certs, pubkey) {
      newLinks[pubkey] = (newLinks[pubkey] || []).concat(_.pluck(certs, 'pubkey'));
    });
    return newLinks;
  }

  function computeNewCerts(forBlock, theNewcomers, joinData) {
    return co(function *() {
      var newCerts = {}, certifiers = [];
      var certsByKey = _.mapObject(joinData, function(val){ return val.certs; });
      for (let i = 0, len = theNewcomers.length; i < len; i++) {
        let newcomer = theNewcomers[i];
        // New array of certifiers
        newCerts[newcomer] = newCerts[newcomer] || [];
        // Check wether each certification of the block is from valid newcomer/member
        for (let j = 0, len2 = certsByKey[newcomer].length; j < len2; j++) {
          let cert = certsByKey[newcomer][j];
          let isAlreadyCertifying = certifiers.indexOf(cert.from) !== -1;
          if (!(isAlreadyCertifying && forBlock > 0)) {
            if (~theNewcomers.indexOf(cert.from)) {
              // Newcomer to newcomer => valid link
              newCerts[newcomer].push(cert);
              certifiers.push(cert.from);
            } else {
              let isMember = yield dal.isMember(cert.from);
              // Member to newcomer => valid link
              if (isMember) {
                newCerts[newcomer].push(cert);
                certifiers.push(cert.from);
              }
            }
          }
        }
      }
      return newCerts;
    });
  }

  function getSinglePreJoinData(current, idHash, done, joiners) {
    return co(function *() {
      var identity = yield dal.getIdentityByHashOrNull(idHash);
      var foundCerts = [];
      let blockOfChainability = current ? (yield dal.getChainabilityBlock(current.medianTime, conf.sigPeriod)) : null;
      if (!identity) {
        throw 'Identity with hash \'' + idHash + '\' not found';
      }
      if (!identity.wasMember && identity.buid != constants.BLOCK.SPECIAL_BLOCK) {
        let idtyBasedBlock = yield dal.getBlock(identity.buid);
        let age = current.medianTime - idtyBasedBlock.medianTime;
        if (age > conf.idtyWindow) {
          throw 'Too old identity';
        }
      }
      let idty = new Identity(identity);
      idty.currency = conf.currency;
      let selfCert = idty.rawWithoutSig();
      let verified = keyring.verify(selfCert, idty.sig, idty.pubkey);
      if (!verified) {
        throw constants.ERRORS.IDENTITY_WRONGLY_SIGNED;
      }
      if (!identity.leaving) {
        if (!current) {
          // Look for certifications from initial joiners
          // TODO: check if this is still working
          let certs = yield dal.certsNotLinkedToTarget(idHash);
          foundCerts = _.filter(certs, function(cert){
            return ~joiners.indexOf(cert.from);
          });
        } else {
          // Look for certifications from WoT members
          let certs = yield dal.certsNotLinkedToTarget(idHash);
          var certifiers = [];
          for (let i = 0; i < certs.length; i++) {
            let cert = certs[i];
            try {
              var basedBlock = yield dal.getBlock(cert.block_number);
              if (!basedBlock) {
                throw 'Unknown timestamp block for identity';
              }
              if (current) {
                let age = current.medianTime - basedBlock.medianTime;
                if (age > conf.sigWindow || age > conf.sigValidity) {
                  throw 'Too old certification';
                }
              }
              // Already exists a link not replayable yet?
              var exists = yield dal.existsLinkFromOrAfterDate(cert.from, cert.to, current.medianTime - conf.sigValidity);
              if (exists) {
                throw 'It already exists a similar certification written, which is not replayable yet';
              }
              // Already exists a link not chainable yet?
              exists = yield dal.existsNonChainableLink(cert.from, blockOfChainability ? blockOfChainability.number : -1, conf.sigStock);
              if (exists) {
                throw 'It already exists a certification written which is not chainable yet';
              }
              var isMember = yield dal.isMember(cert.from);
              var doubleSignature = ~certifiers.indexOf(cert.from) ? true : false;
              if (isMember && !doubleSignature) {
                var isValid = yield rules.HELPERS.checkCertificationIsValidForBlock(cert, { number: current.number + 1, currency: current.currency }, identity, conf, dal);
                if (isValid) {
                  certifiers.push(cert.from);
                  foundCerts.push(cert);
                }
              }
            } catch (e) {
              console.error(e.stack);
              // Go on
            }
          }
        }
      }
      return {
        identity: identity,
        key: null,
        idHash: idHash,
        certs: foundCerts
      };
    })
      .then((join) => done(null, join))
      .catch(done);
  }

  function createBlock (current, joinData, leaveData, updates, revocations, exclusions, lastUDBlock, transactions) {
    // Revocations have an impact on exclusions
    revocations.forEach((idty) => exclusions.push(idty.pubkey));
    // Prevent writing joins/updates for excluded members
    exclusions = _.uniq(exclusions);
    exclusions.forEach(function (excluded) {
      delete updates[excluded];
      delete joinData[excluded];
      delete leaveData[excluded];
    });
    _(leaveData).keys().forEach(function (leaver) {
      delete updates[leaver];
      delete joinData[leaver];
    });
    var block = new Block();
    block.version = constants.DOCUMENTS_VERSION;
    block.currency = current ? current.currency : conf.currency;
    block.nonce = 0;
    block.number = current ? current.number + 1 : 0;
    block.parameters = block.number > 0 ? '' : [
      conf.c, conf.dt, conf.ud0,
      conf.sigPeriod, conf.sigStock, conf.sigWindow, conf.sigValidity,
      conf.sigQty, conf.idtyWindow, conf.msWindow, conf.xpercent, conf.msValidity,
      conf.stepMax, conf.medianTimeBlocks, conf.avgGenTime, conf.dtDiffEval,
      conf.blocksRot, (conf.percentRot == 1 ? "1.0" : conf.percentRot)
    ].join(':');
    block.previousHash = current ? current.hash : "";
    block.previousIssuer = current ? current.issuer : "";
    if (selfPubkey)
      block.issuer = selfPubkey;
    // Members merkle
    var joiners = _(joinData).keys();
    var previousCount = current ? current.membersCount : 0;
    if (joiners.length == 0 && !current) {
      throw constants.ERRORS.CANNOT_ROOT_BLOCK_NO_MEMBERS;
    }
    // Newcomers
    block.identities = [];
    // Newcomers + back people
    block.joiners = [];
    joiners.forEach(function(joiner){
      var data = joinData[joiner];
      // Identities only for never-have-been members
      if (!data.identity.member && !data.identity.wasMember) {
        block.identities.push(new Identity(data.identity).inline());
      }
      // Join only for non-members
      if (!data.identity.member) {
        block.joiners.push(new Membership(data.ms).inline());
      }
    });
    block.identities = _.sortBy(block.identities, (line) => {
      let sp = line.split(':');
      return sp[2] + sp[3];
    });
    // Renewed
    block.actives = [];
    joiners.forEach(function(joiner){
      var data = joinData[joiner];
      // Join only for non-members
      if (data.identity.member) {
        block.actives.push(new Membership(data.ms).inline());
      }
    });
    // Leavers
    block.leavers = [];
    var leavers = _(leaveData).keys();
    leavers.forEach(function(leaver){
      var data = leaveData[leaver];
      // Join only for non-members
      if (data.identity.member) {
        block.leavers.push(new Membership(data.ms).inline());
      }
    });
    block.revoked = revocations.map((idty) => [idty.pubkey, idty.revocation_sig].join(':'));
    // Kicked people
    block.excluded = exclusions;
    // Final number of members
    block.membersCount = previousCount + block.joiners.length - block.excluded.length;

    //----- Certifications -----

    // Certifications from the WoT, to newcomers
    block.certifications = [];
    joiners.forEach(function(joiner){
      var data = joinData[joiner] || [];
      data.certs.forEach(function(cert){
        block.certifications.push(new Certification(cert).inline());
      });
    });
    // Certifications from the WoT, to the WoT
    _(updates).keys().forEach(function(certifiedMember){
      var certs = updates[certifiedMember] || [];
      certs.forEach(function(cert){
        block.certifications.push(new Certification(cert).inline());
      });
    });
    // Transactions
    block.transactions = [];
    transactions.forEach(function (tx) {
      block.transactions.push({ raw: tx.compact() });
    });
    return co(function *() {
      block.powMin = block.number == 0 ? 0 : yield rules.HELPERS.getPoWMin(block.number, conf, dal);
      if (block.number == 0) {
        block.medianTime = moment.utc().unix() - conf.rootoffset;
      }
      else {
        block.medianTime = yield rules.HELPERS.getMedianTime(block.number, conf, dal);
      }
      // Universal Dividend
      var lastUDTime = lastUDBlock && lastUDBlock.UDTime;
      if (!lastUDTime) {
        let rootBlock = yield dal.getBlockOrNull(0);
        lastUDTime = rootBlock && rootBlock.UDTime;
      }
      if (lastUDTime != null) {
        if (current && lastUDTime + conf.dt <= block.medianTime) {
          var M = current.monetaryMass || 0;
          var c = conf.c;
          var N = block.membersCount;
          var previousUD = lastUDBlock ? lastUDBlock.dividend : conf.ud0;
          var previousUB = lastUDBlock ? lastUDBlock.unitbase : constants.FIRST_UNIT_BASE;
          if (N > 0) {
            block.dividend = Math.ceil(Math.max(previousUD, c * M / Math.pow(10,previousUB) / N));
            block.unitbase = previousUB;
            if (block.dividend >= Math.pow(10, constants.NB_DIGITS_UD)) {
              block.dividend = Math.ceil(block.dividend / 10.0);
              block.unitbase++;
            }
          } else {
            // The community has collapsed. RIP.
            block.dividend = 0;
          }
        }
      }
      // InnerHash
      block.time = block.medianTime;
      block.inner_hash = hashf(rawer.getBlockInnerPart(block)).toUpperCase();
      return block;
    });
  }
}

/**
 * Class to implement strategy of automatic selection of incoming data for next block.
 * @constructor
 */
function NextBlockGenerator(conf, dal) {

  this.findNewCertsFromWoT = function(current) {
    return co(function *() {
      var updates = {};
      var updatesToFrom = {};
      var certs = yield dal.certsFindNew();
      // The block above which (above from current means blocks with number < current)
      let blockOfChainability = current ? (yield dal.getChainabilityBlock(current.medianTime, conf.sigPeriod)) : null;
      for (var i = 0; i < certs.length; i++) {
        var cert = certs[i];
        var exists = false;
        if (current) {
          // Already exists a link not replayable yet?
          exists = yield dal.existsLinkFromOrAfterDate(cert.from, cert.to, current.medianTime - conf.sigValidity);
        }
        if (!exists) {
          // Already exists a link not chainable yet?
          // No chainability block means absolutely nobody can issue certifications yet
          exists = current && (yield dal.existsNonChainableLink(cert.from, blockOfChainability ? blockOfChainability.number : -1, conf.sigStock));
          if (!exists) {
            // It does NOT already exists a similar certification written, which is not replayable yet
            // Signatory must be a member
            var isSignatoryAMember = yield dal.isMember(cert.from);
            var isCertifiedANonLeavingMember = isSignatoryAMember && (yield dal.isMemberAndNonLeaver(cert.to));
            // Certified must be a member and non-leaver
            if (isSignatoryAMember && isCertifiedANonLeavingMember) {
              updatesToFrom[cert.to] = updatesToFrom[cert.to] || [];
              updates[cert.to] = updates[cert.to] || [];
              if (updatesToFrom[cert.to].indexOf(cert.from) == -1) {
                updates[cert.to].push(cert);
                updatesToFrom[cert.to].push(cert.from);
              }
            }
          }
        }
      }
      return updates;
    });
  };

  this.filterJoiners = function takeAllJoiners(preJoinData, done) {
    // No manual filtering, takes all BUT already used UID or pubkey
    var filtered = {};
    async.forEach(_.keys(preJoinData), function(pubkey, callback) {
      async.waterfall([
        function(next) {
          rules.HELPERS.checkExistsUserID(preJoinData[pubkey].identity.uid, dal).then((exists) => next(null, exists ? true : false)).catch(next);
        },
        function(exists, next) {
          if (exists && !preJoinData[pubkey].identity.wasMember) {
            return next('UID already taken');
          }
          rules.HELPERS.checkExistsPubkey(pubkey, dal).then((exists) => next(null, exists ? true : false)).catch(next);
        },
        function(exists, next) {
          if (exists && !preJoinData[pubkey].identity.wasMember) {
            return next('Pubkey already taken');
          }
          next();
        }
      ], function(err) {
        if (!err) {
          filtered[pubkey] = preJoinData[pubkey];
        }
        callback();
      });
    }, function(err) {
      done(err, filtered);
    });
  };
}

/**
 * Class to implement strategy of manual selection of root members for root block.
 * @constructor
 */
function ManualRootGenerator() {

  this.findNewCertsFromWoT = function() {
    return Q({});
  };

  this.filterJoiners = function(preJoinData, next) {
    var joinData = {};
    var newcomers = _(preJoinData).keys();
    var uids = [];
    newcomers.forEach(function(newcomer){
      uids.push(preJoinData[newcomer].ms.userid);
    });
    if (newcomers.length > 0) {
      inquirer.prompt([{
        type: "checkbox",
        name: "uids",
        message: "Newcomers to add",
        choices: uids,
        default: uids[0]
      }], function (answers) {
        newcomers.forEach(function(newcomer){
          if (~answers.uids.indexOf(preJoinData[newcomer].ms.userid))
            joinData[newcomer] = preJoinData[newcomer];
        });
        if (answers.uids.length == 0)
          next('No newcomer selected');
        else
          next(null, joinData);
      });
    } else {
      next('No newcomer found');
    }
  };
}
