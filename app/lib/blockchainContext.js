"use strict";
var async           = require('async');
var _               = require('underscore');
var co              = require('co');
var Q               = require('q');
var sha1            = require('sha1');
var rawer           = require('./rawer');
var localValidator  = require('./localValidator');
var globalValidator = require('./globalValidator');
var blockchainDao   = require('./blockchainDao');

module.exports = function(conf, dal) {
  return new BlockchainContext(conf, dal);
};

function BlockchainContext(conf, dal) {

  var that = this;
  var logger = require('../lib/logger')(dal.profile);

  var Identity      = require('./entity/identity');
  var Certification = require('./entity/certification');
  var Membership    = require('./entity/membership');
  var Block         = require('./entity/block');
  var Link          = require('./entity/link');
  var Source        = require('./entity/source');
  var Transaction   = require('./entity/transaction');

  this.dal = dal;

  this.checkBlock = function(block, withPoWAndSignature, done) {
    return Q.Promise(function(resolve, reject){
      var localValidation = localValidator(conf);
      var globalValidation = globalValidator(conf, blockchainDao(block, dal));
      async.waterfall([
        function (nextOne){
          if (withPoWAndSignature) {
            return localValidation.validate(block, nextOne);
          }
          localValidation.validateWithoutPoWAndSignature(block, nextOne);
        },
        function (nextOne){
          if (withPoWAndSignature) {
            return globalValidation.validate(block, nextOne);
          }
          globalValidation.validateWithoutPoW(block, nextOne);
        },
        function (nextOne) {
          // Check document's coherence
          checkIssuer(block, nextOne);
        }
      ], function(err) {
        err ? reject(err) : resolve();
        done && done(err);
      });
    });
  };

  this.addBlock = function (obj) {
    return Q.Promise(function(resolve, reject){
      var start = new Date();
      var block = new Block(obj);
      var currentBlock = null;
      async.waterfall([
        function (next) {
          getCurrentBlock(next);
        },
        function (current, next){
          currentBlock = current;
          block.fork = false;
          saveBlockData(currentBlock, block, next);
        }
      ], function (err) {
        !err && logger.info('Block #' + block.number + ' added to the blockchain in %s ms', (new Date() - start));
        err ? reject(err) : resolve(block);
      });
    })
      .catch(function(err){
        throw err;
      });
  };

  this.addSideBlock = (obj) => co(function *() {
    var start = new Date();
    var block = new Block(obj);
    block.fork = true;
    try {
      // Saves the block (DAL)
      block.wrong = false;
      yield dal.saveSideBlockInFile(block);
      logger.info('SIDE Block #' + block.number + ' added to the blockchain in %s ms', (new Date() - start));
      return block;
    } catch (err) {
      throw err;
    }
  });

  this.revertCurrentBlock = () => co(function *() {
    let current = yield that.current();
    logger.debug('Reverting block #%s...', current.number);
    let res = yield that.revertBlock(current);
    logger.debug('Reverted block #%s', current.number);
    return res;
  });

  this.revertBlock = (block) => co(function *() {
    let previousBlock = yield dal.getBlockByNumberAndHashOrNull(block.number - 1, block.previousHash || '');
    // Set the block as SIDE block (equivalent to removal from main branch)
    yield dal.blockDAL.setSideBlock(block, previousBlock);
    yield undoCertifications(block);
    yield undoLinks(block);
    if (previousBlock) {
      yield dal.undoObsoleteLinks(previousBlock.medianTime - conf.sigValidity);
    }
    yield undoMembersUpdate(block);
    yield undoTransactionSources(block);
    yield undoDeleteTransactions(block);
  });

  function checkIssuer (block, done) {
    async.waterfall([
      function (next){
        dal.isMember(block.issuer, next);
      },
      function (isMember, next){
        if (isMember)
          next();
        else {
          if (block.number == 0) {
            if (matchesList(new RegExp('^' + block.issuer + ':'), block.joiners)) {
              next();
            } else {
              next('Block not signed by the root members');
            }
          } else {
            next('Block must be signed by an existing member');
          }
        }
      }
    ], done);
  }

  function matchesList (regexp, list) {
    var i = 0;
    var found = "";
    while (!found && i < list.length) {
      found = list[i].match(regexp) ? list[i] : "";
      i++;
    }
    return found;
  }

  function getCurrentBlock(done) {
    return dal.getCurrentBlockOrNull(done);
  }

  that.current = getCurrentBlock;

  function saveBlockData (current, block, done) {
    async.waterfall([
      function (next) {
        updateBlocksComputedVars(current, block, next);
      },
      function (next) {
        // Saves the block (DAL)
        dal.saveBlock(block, next);
      },
      function (next) {
        that.saveParametersForRootBlock(block, next);
      },
      function (next) {
        // Create/Update members (create new identities if do not exist)
        updateMembers(block, next);
      },
      function (next) {
        // Create/Update certifications
        updateCertifications(block, next);
      },
      function (next) {
        // Create/Update certifications
        updateMemberships(block, next);
      },
      function (next){
        // Save links
        updateLinks(block, next, dal.getBlockOrNull.bind(dal));
      },
      function (next){
        // Compute obsolete links
        computeObsoleteLinks(block, next);
      },
      function (next){
        // Compute obsolete memberships (active, joiner)
        computeObsoleteMemberships(block)
          .then(function() {
            next();
          })
          .catch(next);
      },
      function (next){
        // Update consumed sources & create new ones
        updateTransactionSources(block, next);
      },
      function (next){
        // Delete eventually present transactions
        deleteTransactions(block, next);
      }
    ], function (err) {
      done(err, block);
    });
  }

  function updateBlocksComputedVars (current, block, done) {
    // Monetary Mass update
    if (current) {
      block.monetaryMass = (current.monetaryMass || 0) + block.dividend * block.membersCount;
    }
    // UD Time update
    if (block.number == 0) {
      block.UDTime = block.medianTime; // Root = first UD time
      done();
    }
    else if (block.dividend) {
      async.waterfall([
        function (next) {
          async.parallel({
            last: function (callback) {
              blockchainDao(block, dal).getLastUDBlock(callback);
            },
            root: function (callback) {
              blockchainDao(block, dal).getBlock(0, callback);
            }
          }, next);
        },
        function (res, next) {
          var last = res.last;
          var root = res.root;
          block.UDTime = conf.dt + (last ? last.UDTime : root.medianTime);
          next();
        }
      ], done);
    }
    else done();
  }

  this.updateMembers = updateMembers;
  this.updateCertifications = updateCertifications;
  this.updateMemberships = updateMemberships;
  this.updateLinks = updateLinks;
  this.updateTransactionSources = updateTransactionSources;
  this.computeObsoleteLinks = computeObsoleteLinks;
  this.computeObsoleteMemberships = computeObsoleteMemberships;

  let cleanRejectedIdentities = (idty) => co(function *() {
    yield dal.removeUnWrittenWithPubkey(idty.pubkey);
    yield dal.removeUnWrittenWithUID(idty.uid);
  });

  function updateMembers (block, done) {
    return co(function *() {
      // Newcomers
      for (let i = 0, len = block.identities.length; i < len; i++) {
        let identity = block.identities[i];
        let idty = Identity.statics.fromInline(identity);
        // Computes the hash if not done yet
        if (!idty.hash)
          idty.hash = (sha1(rawer.getIdentity(idty)) + "").toUpperCase();
        yield dal.newIdentity(idty, block.number);
        yield cleanRejectedIdentities(idty);
      }
      // Joiners (come back)
      for (let i = 0, len = block.joiners.length; i < len; i++) {
        let inlineMS = block.joiners[i];
        let ms = Identity.statics.fromInline(inlineMS);
        yield dal.joinIdentity(ms.pubkey, block.number);
      }
      // Actives
      for (let i = 0, len = block.actives.length; i < len; i++) {
        let inlineMS = block.actives[i];
        let ms = Identity.statics.fromInline(inlineMS);
        yield dal.activeIdentity(ms.pubkey, block.number);
      }
      // Actives
      for (let i = 0, len = block.leavers.length; i < len; i++) {
        let inlineMS = block.leavers[i];
        let ms = Identity.statics.fromInline(inlineMS);
        yield dal.leaveIdentity(ms.pubkey, block.number);
      }
      // Excluded
      for (let i = 0, len = block.excluded.length; i < len; i++) {
        let excluded = block.excluded[i];
        dal.excludeIdentity(excluded);
      }
      done();
    })
      .catch(done);
  }

  function undoMembersUpdate (block) {
    return co(function *() {
      // Undo 'join' which can be either newcomers or comebackers
      for (let i = 0, len = block.joiners.length; i < len; i++) {
        let msRaw = block.joiners[i];
        let ms = Membership.statics.fromInline(msRaw, 'IN', conf.currency);
        yield dal.unJoinIdentity(ms);
      }
      // Undo newcomers (may strengthen the undo 'join')
      for (let i = 0, len = block.identities.length; i < len; i++) {
        let identity = block.identities[i];
        let idty = Identity.statics.fromInline(identity);
        yield dal.unacceptIdentity(idty.pubkey);
      }
      // Undo renew (only remove last membership IN document)
      for (let i = 0, len = block.actives.length; i < len; i++) {
        let msRaw = block.actives[i];
        let ms = Membership.statics.fromInline(msRaw, 'IN', conf.currency);
        yield dal.unRenewIdentity(ms.issuer);
      }
      // Undo leavers (forget about their last membership OUT document)
      for (let i = 0, len = block.leavers.length; i < len; i++) {
        let msRaw = block.leavers[i];
        let ms = Membership.statics.fromInline(msRaw, 'OUT', conf.currency);
        yield dal.unLeaveIdentity(ms.issuer);
      }
      // Undo excluded (make them become members again, but set them as 'to be kicked')
      for (let i = 0, len = block.excluded.length; i < len; i++) {
        let pubkey = block.excluded[i];
        yield dal.unExcludeIdentity(pubkey);
      }
    });
  }

  function undoCertifications(block) {
    return co(function *() {
      for (let i = 0, len = block.certifications.length; i < len; i++) {
        let inlineCert = block.certifications[i];
        let cert = Certification.statics.fromInline(inlineCert);
        let toIdty = yield dal.getWrittenIdtyByPubkey(cert.to);
        cert.target = new Identity(toIdty).getTargetHash();
        let existing = yield dal.existsCert(cert);
        existing.written_block = null;
        existing.written_hash = null;
        existing.linked = false;
        existing.written = false;
        yield dal.saveCert(new Certification(cert));
      }
    });
  }

  function undoLinks(block) {
    return co(function *() {
      for (let i = 0, len = block.certifications.length; i < len; i++) {
        let inlineCert = block.certifications[i];
        let cert = Certification.statics.fromInline(inlineCert);
        dal.removeLink(
          new Link({
            source: cert.from,
            target: cert.to,
            timestamp: block.medianTime,
            block_number: block.number,
            block_hash: block.hash,
            obsolete: false
          }));
      }
    });
  }

  function undoTransactionSources(block) {
    return co(function *() {
      // Remove any source created for this block (both Dividend and Transaction)
      dal.removeAllSourcesOfBlock(block.number);
      for (let i = 0, len = block.transactions.length; i < len; i++) {
        let obj = block.transactions[i];
        obj.version = 1;
        obj.currency = block.currency;
        obj.issuers = obj.signatories;
        let tx = new Transaction(obj);
        let txObj = tx.getTransaction();
        for (let j = 0, len2 = txObj.inputs.length; j < len2; j++) {
          let input = txObj.inputs[j];
          dal.unConsumeSource(input.type, input.pubkey, input.number, input.fingerprint, input.amount, block.medianTime, block.hash);
        }
      }
    });
  }

  function undoDeleteTransactions(block) {
    return co(function *() {
      for (let i = 0, len = block.transactions.length; i < len; i++) {
        let obj = block.transactions[i];
        obj.version = 1;
        obj.currency = block.currency;
        obj.issuers = obj.signatories;
        let tx = new Transaction(obj);
        yield dal.saveTransaction(tx);
      }
    });
  }

  function updateCertifications (block, done) {
    async.forEachSeries(block.certifications, function(inlineCert, callback){
      var cert = Certification.statics.fromInline(inlineCert);
      var from_uid, to_uid;
      async.waterfall([
        function (next) {
          dal.getWritten(cert.to, next);
        },
        function (idty, next){
          cert.target = new Identity(idty).getTargetHash();
          to_uid = idty.uid;
          dal.getWritten(cert.from, next);
        },
        function (idty, next){
          from_uid = idty.uid;
          dal.existsCert(cert).then(_.partial(next, null)).catch(next);
        },
        function (existing, next) {
          if (existing) {
            cert = existing;
          }
          cert.written_block = block.number;
          cert.written_hash = block.hash;
          cert.from_uid = from_uid;
          cert.to_uid = to_uid;
          cert.linked = true;
          dal.officializeCertification(new Certification(cert))
            .then(_.partial(next, null))
            .catch(next);
        }
      ], callback);
    }, done);
  }

  // TODO: no more needed
  function updateMemberships (block, done) {
    async.forEachSeries(['joiners', 'actives', 'leavers'], function (prop, callback1) {
      async.forEach(block[prop], function(inlineJoin, callback){
        var ms = Membership.statics.fromInline(inlineJoin, prop == 'leavers' ? 'OUT' : 'IN');
        async.waterfall([
          function (next){
            dal.getWritten(ms.issuer, next);
          },
          function (idty, next){
            if (!idty) {
              var err = 'Could not find identity for membership of issuer ' + ms.issuer;
              logger.error(err);
              next(err);
              return;
            }
            ms.userid = idty.uid;
            ms.certts = idty.time;
            next();
          }
        ], callback);
      }, callback1);
    }, done);
  }

  function updateLinks (block, done, getBlockOrNull) {
    async.forEach(block.certifications, function(inlineCert, callback){
      var cert = Certification.statics.fromInline(inlineCert);
      return co(function *() {
        let tagBlock = block;
        if (block.number > 0) {
          tagBlock = yield getBlockOrNull(cert.block_number);
        }
        return dal.saveLink(
          new Link({
            source: cert.from,
            target: cert.to,
            timestamp: tagBlock.medianTime,
            block_number: block.number,
            block_hash: block.hash,
            obsolete: false
          }));
      })
        .then(_.partial(callback, null))
        .catch(callback);
    }, done);
  }

  that.saveParametersForRootBlock = (block, done) => {
    if (block.parameters) {
      var sp = block.parameters.split(':');

      conf.c                = parseFloat(sp[0]);
      conf.dt               = parseInt(sp[1]);
      conf.ud0              = parseInt(sp[2]);
      conf.sigDelay         = parseInt(sp[3]);
      conf.sigValidity      = parseInt(sp[4]);
      conf.sigQty           = parseInt(sp[5]);
      conf.sigWoT           = parseInt(sp[6]);
      conf.msValidity       = parseInt(sp[7]);
      conf.stepMax          = parseInt(sp[8]);
      conf.medianTimeBlocks = parseInt(sp[9]);
      conf.avgGenTime       = parseInt(sp[10]);
      conf.dtDiffEval       = parseInt(sp[11]);
      conf.blocksRot        = parseInt(sp[12]);
      conf.percentRot       = parseFloat(sp[13]);
      conf.currency         = block.currency;
      return dal.saveConf(conf).then(done).catch(done);
    }
    else {
      done && done();
      return Q();
    }
  };

  function computeObsoleteLinks (block, done) {
    async.waterfall([
      function (next){
        dal.obsoletesLinks(block.medianTime - conf.sigValidity).then(function() {
          next();
        }).catch(next);
      },
      function (next){
        dal.getMembers(next);
      },
      function (members, next){
        // If a member no more have enough signatures, he has to be kicked
        async.forEachSeries(members, function(idty, callback){
          var pubkey = idty.pubkey;
          async.waterfall([
            function (nextOne){
              async.parallel({
                enoughLinks: function(callback2){
                  that.checkHaveEnoughLinks(pubkey, {}, function (err) {
                    callback2(null, err);
                  });
                }
              }, nextOne);
            },
            function (res, nextOne){
              var notEnoughLinks = res.enoughLinks;
              dal.setKicked(pubkey, new Identity(idty).getTargetHash(), notEnoughLinks ? true : false, nextOne);
            }
          ], callback);
        }, next);
      }
    ], done);
  }

  this.checkHaveEnoughLinks = function(target, newLinks, done) {
    async.waterfall([
      function (next){
        dal.getValidLinksTo(target).then(_.partial(next, null)).catch(next);
      },
      function (links, next){
        var count = links.length;
        if (newLinks[target] && newLinks[target].length)
          count += newLinks[target].length;
        next(count < conf.sigQty && 'Key ' + target + ' does not have enough links (' + count + '/' + conf.sigQty + ')');
      }
    ], done);
  }

  function computeObsoleteMemberships (block) {
    return dal.getMembershipExcludingBlock(block, conf.msValidity)
      .then(function(last){
        if (last) {
          return dal.kickWithOutdatedMemberships(last.number);
        }
      });
  }

  function updateTransactionSources (block, done) {
    async.parallel([
      function (next) {
        if (block.dividend) {
          async.waterfall([
            function (nextOne) {
              dal.getMembers(nextOne);
            },
            function (idties, nextOne) {
              async.forEachSeries(idties, function (idty, callback) {
                dal.saveSource(new Source({
                  'pubkey': idty.pubkey,
                  'type': 'D',
                  'number': block.number,
                  'time': block.medianTime,
                  'fingerprint': block.hash,
                  'block_hash': block.hash,
                  'amount': block.dividend,
                  'consumed': 0
                })).then(_.partial(callback, null)).catch(callback);
              }, nextOne);
            }
          ], next);
        }
        else next();
      },
      function (next) {
        async.forEachSeries(block.transactions, function (json, callback) {
          var obj = json;
          obj.version = 1;
          obj.currency = block.currency;
          obj.issuers = json.signatories;
          var tx = new Transaction(obj);
          var txObj = tx.getTransaction();
          var txHash = tx.getHash(true);
          async.parallel([
            function (nextOne) {
              async.forEachSeries(txObj.inputs, function (input, callback2) {
                dal.setConsumedSource(input.type, input.pubkey, input.number, input.fingerprint, input.amount).then(_.partial(callback2, null)).catch(callback2);
              }, nextOne);
            },
            function (nextOne) {
              async.forEachSeries(txObj.outputs, function (output, callback2) {
                dal.saveSource(new Source({
                  'pubkey': output.pubkey,
                  'type': 'T',
                  'number': block.number,
                  'block_hash': block.hash,
                  'fingerprint': txHash,
                  'amount': output.amount,
                  'consumed': 0
                })).then(_.partial(callback2, null)).catch(callback2);
              }, nextOne);
            }
          ], callback);
        }, next);
      }
    ], function (err) {
      done(err);
    });
  }

  function deleteTransactions (block, done) {
    async.forEachSeries(block.transactions, function (json, callback) {
      var obj = json;
      obj.version = 1;
      obj.currency = block.currency;
      obj.issuers = json.signatories;
      var tx = new Transaction(obj);
      var txHash = tx.getHash();
      dal.removeTxByHash(txHash).then(_.partial(callback, null)).catch(callback);
    }, done);
  }
}
