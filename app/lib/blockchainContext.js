"use strict";
var async           = require('async');
var _               = require('underscore');
var Q               = require('q');
var sha1            = require('sha1');
var rawer           = require('./rawer');
var base58          = require('./base58');
var signature       = require('./signature');
var constants       = require('./constants');
var localValidator  = require('./localValidator');
var globalValidator = require('./globalValidator');
var blockchainDao   = require('./blockchainDao');

module.exports = function(conf, dal) {
  return new BlockchainContext(conf, dal);
};

var blockFifo = async.queue(function (task, callback) {
  task(callback);
}, 1);

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

  this.addBlock = function (obj, doCheck) {
    return Q.Promise(function(resolve, reject){
      blockFifo.push(function (sent) {
        var start = new Date();
        var block = new Block(obj);
        var currentBlock = null;
        var localValidation = localValidator(conf);
        var globalValidation = globalValidator(conf, blockchainDao(block, dal));
        async.waterfall([
          function (next) {
            getCurrentBlock(next);
          },
          function (current, next){
            currentBlock = current;
            if (doCheck) {
              async.waterfall([
                function (nextOne){
                  localValidation.validate(block, nextOne);
                },
                function (nextOne){
                  globalValidation.validate(block, nextOne);
                },
                function (nextOne) {
                  // Check document's coherence
                  checkIssuer(block, nextOne);
                },
                function (nextOne) {
                  saveBlockData(currentBlock, block, nextOne);
                }
              ], next);
            } else {
              saveBlockData(currentBlock, block, next);
            }
          }
        ], function (err) {
          !err && logger.info('Block #' + block.number + ' added to the blockchain in %s ms', (new Date() - start));
          sent(err, !err && block);
        });
      }, function(err, block) {
        err ? reject(err) : resolve(block);
      });
    });
  };

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
    dal.getCurrentBlockOrNull(done);
  }

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
        saveParametersForRootBlock(block, next);
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
        updateLinks(block, next);
      },
      function (next){
        // Compute obsolete links
        computeObsoleteLinks(block, next);
      },
      function (next){
        // Compute obsolete memberships (active, joiner)
        computeObsoleteMemberships(block, next);
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

  function updateMembers (block, done) {
    async.waterfall([
      function (next) {
        // Newcomers
        async.forEachSeries(block.identities, function(identity, callback){
          var idty = Identity.statics.fromInline(identity);
          var indexNb = block.identities.indexOf(identity);
          async.waterfall([
            function (nextOne){
              // Computes the hash if not done yet
              if (!idty.hash)
                idty.hash = (sha1(rawer.getIdentity(idty)) + "").toUpperCase();
              dal.getIdentityByPubkeyAndHashOrNull(idty.pubkey, idty.getTargetHash(), nextOne);
            },
            function (existing, nextOne){
              if (existing) {
                idty = existing;
              }
              idty.currentMSN = block.number;
              idty.member = true;
              idty.wasMember = true;
              idty.kick = false;
              idty.indexNb = indexNb;
              dal.saveIdentity(new Identity(idty), function (err) {
                nextOne(err);
              });
            }
          ], callback);
        }, next);
      },
      function (next) {
        // Joiners (come back)
        async.forEachSeries(block.joiners, function(inlineMS, callback){
          var ms = Identity.statics.fromInline(inlineMS);
          async.waterfall([
            function (nextOne){
              // Necessarily exists, since we've just created them in the worst case
              dal.getWritten(ms.pubkey, nextOne);
            },
            function (idty, nextOne){
              idty.currentMSN = block.number;
              idty.member = true;
              idty.kick = false;
              dal.saveIdentity(new Identity(idty), function (err) {
                nextOne(err);
              });
            }
          ], callback);
        }, next);
      },
      function (next) {
        // Actives
        async.forEachSeries(block.actives, function(inlineMS, callback){
          var ms = Identity.statics.fromInline(inlineMS);
          async.waterfall([
            function (nextOne){
              dal.getWritten(ms.pubkey, nextOne);
            },
            function (idty, nextOne){
              idty.currentMSN = block.number;
              idty.member = true;
              idty.kick = false;
              dal.saveIdentity(new Identity(idty), function (err) {
                nextOne(err);
              });
            }
          ], callback);
        }, next);
      },
      function (next) {
        // Leavers
        async.forEachSeries(block.leavers, function(inlineMS, callback){
          var ms = Identity.statics.fromInline(inlineMS);
          async.waterfall([
            function (nextOne){
              dal.getWritten(ms.pubkey, nextOne);
            },
            function (idty, nextOne){
              idty.currentMSN = block.number;
              idty.member = true;
              idty.leaving = true;
              idty.kick = false;
              dal.saveIdentity(new Identity(idty), function (err) {
                nextOne(err);
              });
            }
          ], callback);
        }, next);
      },
      function (next) {
        // Excluded
        async.forEach(block.excluded, function (pubkey, callback) {
          async.waterfall([
            function (nextOne) {
              dal.getWritten(pubkey, nextOne);
            },
            function (idty, nextOne) {
              idty.member = false;
              idty.kick = false;
              dal.saveIdentity(new Identity(idty), function (err) {
                nextOne(err);
              });
            }
          ], callback);
        }, next);
      }
    ], done);
  }

  function updateCertifications (block, done) {
    async.forEachSeries(block.certifications, function(inlineCert, callback){
      var cert = Certification.statics.fromInline(inlineCert);
      var indexNb = block.certifications.indexOf(inlineCert);
      async.waterfall([
        function (next) {
          dal.getWritten(cert.to, next);
        },
        function (idty, next){
          cert.target = new Identity(idty).getTargetHash();
          dal.existsCert(cert, next);
        },
        function (existing, next) {
          if (existing) {
            cert = existing;
          }
          cert.linked = true;
          cert.block = block.number;
          cert.indexNb = indexNb;
          dal.saveCertification(new Certification(cert), function (err) {
            next(err);
          });
        }
      ], callback);
    }, done);
  }

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
            dal.deleteIfExists(ms, function (err2) {
              next(err2);
            });
          }
        ], callback);
      }, callback1);
    }, done);
  }

  function updateLinks (block, done) {
    async.forEach(block.certifications, function(inlineCert, callback){
      var cert = Certification.statics.fromInline(inlineCert);
      dal.saveLink(
        new Link({
          source: cert.from,
          target: cert.to,
          timestamp: block.medianTime,
          obsolete: false
        }), function (err) {
          callback(err);
        });
    }, done);
  }

  function saveParametersForRootBlock (block, done) {
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
      dal.saveConf(conf, function (err) {
        done(err);
      });
    }
    else done();
  }

  function computeObsoleteLinks (block, done) {
    async.waterfall([
      function (next){
        dal.obsoletesLinks(block.medianTime - conf.sigValidity, next);
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
        dal.currentValidLinks(target, next);
      },
      function (links, next){
        var count = links.length;
        if (newLinks[target] && newLinks[target].length)
          count += newLinks[target].length;
        next(count < conf.sigQty && 'Key ' + target + ' does not have enough links (' + count + '/' + conf.sigQty + ')');
      }
    ], done);
  }

  function computeObsoleteMemberships (block, done) {
    async.waterfall([
      function (next){
        dal.getLastBeforeOrAt(block.medianTime - conf.msValidity, next);
      },
      function (last, next){
        if (last)
          dal.kickWithOutdatedMemberships(last.number, next);
        else
          next();
      }
    ], done);
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
                  'amount': block.dividend,
                  'consumed': 0
                }), function (err) {
                  callback(err);
                });
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
                dal.setConsumedSource(input.type, input.pubkey, input.number, input.fingerprint, input.amount, callback2);
              }, nextOne);
            },
            function (nextOne) {
              async.forEachSeries(txObj.outputs, function (output, callback2) {
                dal.saveSource(new Source({
                  'pubkey': output.pubkey,
                  'type': 'T',
                  'number': block.number,
                  'fingerprint': txHash,
                  'amount': output.amount,
                  'consumed': 0
                }), function (err) {
                  callback2(err);
                });
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
      dal.removeTxByHash(txHash, callback);
    }, done);
  }
}
