"use strict";
var async           = require('async');
var _               = require('underscore');
var co              = require('co');
var Q               = require('q');
var sha1            = require('sha1');
var moment          = require('moment');
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
      function (next){
        // Save links
        updateLinksForBlocks([block], dal.getBlockOrNull.bind(dal)).then(() => next()).catch(next);
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
    if (current) {
      logger.trace('Block median time +%s', block.medianTime - current.medianTime);
      logger.trace('Block time ' + ((block.time - current.time) >= 0 ? '+' : '') + '%d', block.time - current.time);
    }
    // Monetary Mass update
    if (current) {
      block.monetaryMass = (current.monetaryMass || 0) + (block.dividend || 0) * block.membersCount;
    }
    // UD Time update
    if (block.number == 0) {
      block.UDTime = block.medianTime; // Root = first UD time
      block.dividend = 0;
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
    else {
      block.dividend = 0;
      block.UDTime = current.UDTime;
      done();
    }
  }

  this.updateMembers = updateMembers;
  this.updateCertifications = updateCertifications;
  this.computeObsoleteLinks = computeObsoleteLinks;
  this.computeObsoleteMemberships = computeObsoleteMemberships;
  this.updateTransactionSourcesForBlocks = updateTransactionSourcesForBlocks;
  this.updateCertificationsForBlocks = updateCertificationsForBlocks;
  this.updateMembershipsForBlocks = updateMembershipsForBlocks;
  this.updateLinksForBlocks = updateLinksForBlocks;
  this.updateTransactionsForBlocks = updateTransactionsForBlocks;

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
        let fromIdty = yield dal.getWrittenIdtyByPubkey(cert.from);
        let toIdty = yield dal.getWrittenIdtyByPubkey(cert.to);
        dal.removeLink(
          new Link({
            source: cert.from,
            target: cert.to,
            from_wotb_id: fromIdty.wotb_id,
            to_wotb_id: toIdty.wotb_id,
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

  /**
   * Historical method that takes certifications from a block and tries to either:
   *  * Update the certification found in the DB an set it as written
   *  * Create it if it does not exist
   *
   * Has a sibling method named 'updateCertificationsForBlocks'.
   * @param block
   * @param done
   */
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

  that.saveParametersForRootBlock = (block, done) => {
    if (block.parameters) {
      var sp = block.parameters.split(':');

      conf.c                = parseFloat(sp[0]);
      conf.dt               = parseInt(sp[1]);
      conf.ud0              = parseInt(sp[2]);
      conf.sigDelay         = parseInt(sp[3]);
      conf.sigPeriod        = parseInt(sp[4]);
      conf.sigStock         = parseInt(sp[5]);
      conf.sigValidity      = parseInt(sp[6]);
      conf.sigQty           = parseInt(sp[7]);
      conf.sigWoT           = parseInt(sp[8]);
      conf.msValidity       = parseInt(sp[9]);
      conf.stepMax          = parseInt(sp[10]);
      conf.medianTimeBlocks = parseInt(sp[11]);
      conf.avgGenTime       = parseInt(sp[12]);
      conf.dtDiffEval       = parseInt(sp[13]);
      conf.blocksRot        = parseInt(sp[14]);
      conf.percentRot       = parseFloat(sp[15]);
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
              that.checkHaveEnoughLinks(pubkey, {}, function (err) {
                nextOne(null, err);
              });
            },
            function (notEnoughLinks, nextOne){
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
  };

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

  /**
   * New method for CREATING memberships found in blocks.
   * Made for performance reasons, this method will batch insert all memberships at once.
   * @param blocks
   * @returns {*}
   */
  function updateMembershipsForBlocks(blocks) {
    return co(function *() {
      let memberships = [];
      let types = {
        'join': 'joiners',
        'active': 'actives',
        'leave': 'leavers'
      };
      for (let i = 0, len = blocks.length; i < len; i++) {
        let block = blocks[i];
        _.keys(types).forEach(function(type){
          let msType = type == 'leave' ? 'out' : 'in';
          let field = types[type];
          let mss = block[field];
          for (let j = 0, len2 = mss.length; j < len2; j++) {
            let msRaw = mss[j];
            var ms = Membership.statics.fromInline(msRaw, type == 'leave' ? 'OUT' : 'IN', block.currency);
            ms.membership = msType.toUpperCase();
            ms.written = true;
            ms.written_number = block.number;
            ms.type = type;
            ms.hash = String(sha1(ms.getRawSigned())).toUpperCase();
            ms.idtyHash = (sha1(ms.userid + moment(ms.certts).unix() + ms.issuer) + "").toUpperCase();
            memberships.push(ms);
          }
        });
      }
      return dal.updateMemberships(memberships);
    });
  }

  /**
   * New method for CREATING links found in blocks.
   * Made for performance reasons, this method will batch insert all links at once.
   * @param blocks
   * @param getBlockOrNull
   * @returns {*}
   */
  function updateLinksForBlocks(blocks, getBlockOrNull) {
    return co(function *() {
      let links = [];
      for (let i = 0, len = blocks.length; i < len; i++) {
        let block = blocks[i];
        for (let j = 0, len2 = block.certifications.length; j < len2; j++) {
          let inlineCert = block.certifications[j];
          let cert = Certification.statics.fromInline(inlineCert);
          let tagBlock = block;
          if (block.number > 0) {
            tagBlock = yield getBlockOrNull(cert.block_number);
          }
          let fromIdty = yield dal.getWrittenIdtyByPubkey(cert.from);
          let toIdty = yield dal.getWrittenIdtyByPubkey(cert.to);
          links.push({
            source: cert.from,
            target: cert.to,
            from_wotb_id: fromIdty.wotb_id,
            to_wotb_id: toIdty.wotb_id,
            timestamp: tagBlock.medianTime,
            block_number: block.number,
            block_hash: block.hash,
            obsolete: false
          });
        }
      }
      return dal.updateLinks(links);
    });
  }

  /**
   * New method for CREATING transactions found in blocks.
   * Made for performance reasons, this method will batch insert all transactions at once.
   * @param blocks
   * @returns {*}
   */
  function updateTransactionsForBlocks(blocks) {
    return co(function *() {
      let txs = [];
      for (let i = 0, len = blocks.length; i < len; i++) {
        let block = blocks[i];
        txs = txs.concat(block.transactions.map((tx) => {
          _.extend(tx, {
            block_number: block.number,
            time: block.medianTime,
            currency: block.currency,
            written: true,
            removed: false
          });
          return new Transaction(tx);
        }));
      }
      return dal.updateTransactions(txs);
    });
  }

  /**
   * New method for CREATING certifications found in blocks.
   * Made for performance reasons, this method will batch insert all certifications at once.
   * @param blocks
   * @returns {*}
   */
  function updateCertificationsForBlocks(blocks) {
    return co(function *() {
      let certs = [];
      for (let i = 0, len = blocks.length; i < len; i++) {
        let block = blocks[i];
        for (let j = 0, len2 = block.certifications.length; j < len2; j++) {
          let inlineCert = block.certifications[j];
          var cert = Certification.statics.fromInline(inlineCert);
          let to = yield dal.getWrittenIdtyByPubkey(cert.to);
          let to_uid = to.uid;
          cert.target = new Identity(to).getTargetHash();
          let from = yield dal.getWrittenIdtyByPubkey(cert.from);
          let from_uid = from.uid;
          let existing = yield dal.existsCert(cert);
          if (existing) {
            cert = existing;
          }
          cert.written_block = block.number;
          cert.written_hash = block.hash;
          cert.from_uid = from_uid;
          cert.to_uid = to_uid;
          cert.linked = true;
          certs.push(cert);
        }
      }
      return dal.updateCertifications(certs);
    });
  }

  /**
   * New method for CREATING sources found in transactions of blocks.
   * Made for performance reasons, this method will batch insert all sources at once.
   * @param blocks
   * @returns {*}
   */
  function updateTransactionSourcesForBlocks(blocks) {
    return co(function *() {
      let sources = [];
      for (let i = 0, len = blocks.length; i < len; i++) {
        let block = blocks[i];
        // Dividends
        if (block.dividend) {
          let idties = yield dal.getMembersP();
          for (let j = 0, len2 = idties.length; j < len2; j++) {
            let idty = idties[j];
            sources.push({
              'pubkey': idty.pubkey,
              'type': 'D',
              'number': block.number,
              'time': block.medianTime,
              'fingerprint': block.hash,
              'block_hash': block.hash,
              'amount': block.dividend,
              'consumed': false,
              'toConsume': false
            });
          }
        }
        // Transactions
        for (let j = 0, len2 = block.transactions.length; j < len2; j++) {
          let json = block.transactions[j];
          let obj = json;
          obj.version = 1;
          obj.currency = block.currency;
          obj.issuers = json.signatories;
          let tx = new Transaction(obj);
          let txObj = tx.getTransaction();
          let txHash = tx.getHash(true);
          sources = sources.concat(txObj.inputs.map((input) => _.extend({ toConsume: true }, input)));
          sources = sources.concat(txObj.outputs.map((output) => _.extend({
            toConsume: false
          }, {
            'pubkey': output.pubkey,
            'type': 'T',
            'number': block.number,
            'block_hash': block.hash,
            'fingerprint': txHash,
            'amount': output.amount,
            'consumed': false
          })));
        }
      }
      return dal.updateSources(sources);
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
