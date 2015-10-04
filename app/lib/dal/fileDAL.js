"use strict";
var Q       = require('q');
var co      = require('co');
var _       = require('underscore');
var sha1    = require('sha1');
var Membership = require('../entity/membership');
var Merkle = require('../entity/merkle');
var Transaction = require('../entity/transaction');
var Source = require('../entity/source');
var constants = require('../constants');
var ConfDAL = require('./fileDALs/confDAL');
var StatDAL = require('./fileDALs/statDAL');
var CertDAL = require('./fileDALs/CertDAL');
var TxsDAL = require('./fileDALs/TxsDAL');
var SourcesDAL = require('./fileDALs/SourcesDAL');
var CoresDAL = require('./fileDALs/CoresDAL');
var LinksDAL = require('./fileDALs/LinksDAL');
var MembershipDAL = require('./fileDALs/MembershipDAL');
var IdentityDAL = require('./fileDALs/IdentityDAL');
var IndicatorsDAL = require('./fileDALs/IndicatorsDAL');
var PeerDAL = require('./fileDALs/PeerDAL');
var BlockDAL = require('./fileDALs/BlockDAL');

module.exports = {
  memory: function(profile, subPath) {
    return getHomeFS(profile, subPath, true)
      .then(function(params) {
        return Q(new FileDAL(profile, subPath, params.fs));
      });
  },
  file: function(profile, subPath) {
    return getHomeFS(profile, subPath, false)
      .then(function(params) {
        return new FileDAL(profile, subPath, params.fs);
      });
  },
  FileDAL: FileDAL
};

function someDelayFix() {
  return Q.Promise(function(resolve){
    setTimeout(resolve, 100);
  });
}

function getHomeFS(profile, subpath, isMemory) {
  var home = getUCoinHomePath(profile, subpath);
  var fs;
  return someDelayFix()
    .then(function() {
      fs = (isMemory ? require('q-io/fs-mock')({}) : require('q-io/fs'));
      return fs.makeTree(home);
    })
    .then(function(){
      return { fs: fs, home: home };
    });
}

function getUCoinHomePath(profile) {
  var userHome = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
  return userHome + '/.config/ucoin/' + profile;
}

function FileDAL(profile, subPath, myFS, parentFileDAL) {

  var that = this;

  this.name = 'fileDal';
  this.profile = profile;
  this.readFunctions = [];
  this.writeFunctions = [];

  var rootPath = getUCoinHomePath(profile) + (subPath ? '/' + subPath : '');

  // DALs
  var confDAL = new ConfDAL(that);
  var statDAL = new StatDAL(that);
  var certDAL = new CertDAL(that);
  var indicatorsDAL = new IndicatorsDAL(that);
  var txsDAL = new TxsDAL(that);
  var coresDAL = new CoresDAL(that);
  var linksDAL = new LinksDAL(that);
  var msDAL = new MembershipDAL(that);
  var idtyDAL = new IdentityDAL(that);
  var blockDAL = new BlockDAL(that);
  this.peerDAL = new PeerDAL(rootPath, myFS, parentFileDAL && parentFileDAL.peerDAL.coreFS);
  this.sourcesDAL = new SourcesDAL(rootPath, myFS, parentFileDAL && parentFileDAL.sourcesDAL.coreFS);

  this.dals = {
    'confDAL': confDAL,
    'statDAL': statDAL,
    'certDAL': certDAL,
    'indicatorsDAL': indicatorsDAL,
    'txsDAL': txsDAL,
    'coresDAL': coresDAL,
    'linksDAL': linksDAL,
    'msDAL': msDAL,
    'idtyDAL': idtyDAL,
    'blockDAL': blockDAL
  };

  this.newDals = {
    'peerDAL': that.peerDAL,
    'sourcesDAL': that.sourcesDAL
  };

  var currency = '';

  this.init = (overrideConf) => {
    return co(function *() {
      yield _.values(that.newDals).map((dal) => dal.init());
      return yield that.loadConf(overrideConf);
    });
  };

  this.getCurrency = function() {
    return currency;
  };

  this.removeHome = function() {
    return myFS.removeTree(rootPath);
  };

  that.writeFileOfBlock = function(block) {
    return blockDAL.saveBlock(block);
  };

  this.getCores = function() {
    return coresDAL.getCores();
  };

  this.loadCore = function(core, invalidateCache) {
    return co(function *() {
      var theCore = require('./coreDAL')(profile, core.forkPointNumber, core.forkPointHash, myFS, that, invalidateCache);
      yield theCore.init();
      return theCore;
    });
  };

  this.addCore = function(core) {
    return coresDAL.addCore(core);
  };

  this.fork = function(newBlock) {
    var core = {
      forkPointNumber: parseInt(newBlock.number),
      forkPointHash: newBlock.hash,
      forkPointPreviousHash: newBlock.previousHash
    };
    return coresDAL.getCore(core)
      .catch(function(){
        return null;
      })
      .then(function(existing){
        if (existing) {
          throw 'Fork ' + [core.forkPointNumber, core.forkPointHash].join('-') + ' already exists';
        }
        return that.addCore(core)
          .then(function(){
            return that.loadCore(core);
          });
      });
  };

  this.unfork = function(loadedCore) {
    return loadedCore.current()
      .then(function(current){
        var core = {
          forkPointNumber: current.number,
          forkPointHash: current.hash
        };
        return coresDAL.removeCore(core)
          .then(function(){
            return loadedCore.dal.removeHome();
          });
      });
  };

  this.listAllPeers = function() {
    return that.peerDAL.listAll();
  };

  function nullIfError(promise, done) {
    return promise
      .then(function(p){
        done && done(null, p);
        return p;
      })
      .catch(function(){
        done && done(null, null);
        return null;
      });
  }

  function nullIfErrorIs(promise, expectedError, done) {
    return promise
      .then(function(p){
        done && done(null, p);
        return p;
      })
      .catch(function(err){
        if (err == expectedError) {
          done && done(null, null);
          return null;
        }
        if (done) {
          done(err);
          return null;
        }
        throw err;
      });
  }

  this.getPeer = function(pubkey) {
    return that.peerDAL.getPeer(pubkey)
      .catch(function() {
        throw Error('Unknown peer ' + pubkey);
      });
  };

  this.getBlock = function(number, done) {
    return blockDAL.getBlock(number)
      .catch(function(){
        throw 'Block ' + number + ' not found on DAL ' + that.name;
      })
      .then(function(block){
        done && done(null, block);
        return block;
      })
      .catch(function(err){
        done && done(err);
        throw err;
      });
  };

  this.getBlockByNumberAndHash = function(number, hash, done) {
    return that.getBlock(number)
      .then(function(block){
        if (block.hash != hash) throw "Not found";
        else return block;
      })
      .catch(function(){
        throw 'Block ' + [number, hash].join('-') + ' not found in ' + that.name;
      })
      .then(function(block){
        done && done(null, block);
        return block;
      })
      .catch(function(err){
        done && done(err);
        throw err;
      });
  };

  this.getCurrent = function(done) {
    return that.getBlockCurrent(done);
  };

  this.getCurrentBlockOrNull = function(done) {
    return nullIfErrorIs(that.getBlockCurrent(), constants.ERROR.BLOCK.NO_CURRENT_BLOCK, done);
  };

  this.getPromoted = function(number, done) {
    return that.getBlock(number, done);
  };

  // Block
  this.lastUDBlock = function() {
    return indicatorsDAL.getLastUDBlock();
  };

  this.getRootBlock = function(done) {
    return that.getBlock(0, done);
  };

  this.lastBlockOfIssuer = function(issuer) {
    return indicatorsDAL.getLastBlockOfIssuer(issuer);
  };

  this.getBlocksBetween = function(start, end) {
    var s = Math.max(0, start);
    return Q.all(_.range(s, end + 1).map(function(number) {
      return that.getBlock(number);
    }))
      .then(function(results){
        return results.reduce(function(blocks, block) {
          if (block) {
            return blocks.concat(block);
          }
          return blocks;
        }, []);
      });
  };

  this.getCurrentNumber = function() {
    return blockDAL.getCurrent().get('number')
      .catch(function() {
        return -1;
      });
  };

  this.getLastSavedBlockFileNumber = function() {
    return blockDAL.getLastSavedBlockFileNumber();
  };

  this.getBlockCurrent = function(done) {
    return that.getCurrentNumber()
      .then(function(number) {
        if (number != -1)
          return that.getBlock(number);
        else
          throw 'No current block';
      })
      .then(function(block){
        done && done(null, block);
        return block;
      });
  };

  this.getBlockFrom = function(number) {
    return that.getCurrent()
      .then(function(current){
        return that.getBlocksBetween(number, current.number);
      });
  };

  this.getBlocksUntil = function(number) {
    return that.getBlocksBetween(0, number);
  };

  this.getValidLinksFrom = function(from) {
    return linksDAL.getValidLinksFrom(from);
  };

  this.getValidLinksTo = function(to) {
    return linksDAL.getValidLinksTo(to);
  };

  this.getObsoletesFromTo = function(from, to) {
    return linksDAL.getObsoletes()
      .then(function(links){
        return _.chain(links).
          where({ target: to, source: from }).
          sortBy(function(lnk){ return -lnk.timestamp; }).
          value();
      });
  };

  this.getValidFromTo = function(from, to) {
    return that.getValidLinksFrom(from)
      .then(function(links){
        return _.chain(links).
          where({ target: to }).
          value();
      });
  };

  this.getAvailableSourcesByPubkey = function(pubkey) {
    return that.sourcesDAL.getAvailableForPubkey(pubkey);
  };

  this.getIdentityByHashOrNull = function(hash, done) {
    return idtyDAL.getByHash(hash)
      .then(function(idty) {
        done && done(null, idty);
        return idty;
      })
      .catch(function(err) {
        if (done) {
          return done(err);
        }
        throw err;
      });
  };

  this.getIdentityByHashWithCertsOrNull = function(hash, done) {
    return that.fillIdentityWithCerts(that.getIdentityByHashOrNull(hash), done);
  };

  this.fillIdentityWithCerts = function(idtyPromise, done) {
    return idtyPromise
      .then(function(idty){
        if (idty && !idty.length) {
          return certDAL.getToTarget(idty.hash)
            .then(function(certs){
              idty.certs = certs;
              return idty;
            });
        }
        else if (idty) {
          return idty.reduce(function(p, aIdty) {
            return certDAL.getToTarget(aIdty.hash)
              .then(function(certs){
                aIdty.certs = certs;
                return Q();
              });
          }, Q())
            .thenResolve(idty);
        }
        return idty;
      })
      .then(function(idty){
        done && done(null, idty);
        return idty;
      })
      .catch(function(){
        done && done(null, null);
        return null;
      });
  };

  this.getMembers = function(done) {
    return idtyDAL.getWhoIsOrWasMember()
      .then(function(idties) {
        return _.chain(idties).
          where({ member: true }).
          value();
      })
      .then(function(members) {
        done && done(null, members);
        return members;
      })
      .catch(function(err) {
        if (done) {
          return done(err);
        }
        throw err;
      });
  };

  this.getWritten = function(pubkey, done) {
    return that.fillInMembershipsOfIdentity(
      idtyDAL.getFromPubkey(pubkey)
        .then(function(idty){
          return idty;
        }).catch(function() {
          return null;
        }), done);
  };

  this.fillInMembershipsOfIdentity = function(queryPromise, done) {
    return Q(queryPromise)
      .tap(function(idty){
        if (idty) {
          return msDAL.getMembershipsOfIssuer(idty.pubkey)
            .then(function(mss){
              idty.memberships = mss;
            });
        }
      })
      .then(function(idty){
        done && done(null, idty);
        return idty;
      })
      .catch(function(){
        done && done(null, null);
      });
  };

  this.getMembershipsForIssuer = function(pubkey) {
    return msDAL.getMembershipsOfIssuer(pubkey);
  };

  this.findPeersWhoseHashIsIn = function(hashes) {
    return that.peerDAL.listAll()
      .then(function(peers){
        return _.chain(peers).
          filter(function(p){ return hashes.indexOf(p.hash) !== -1; }).
          value();
      });
  };

  this.getTxByHash = function(hash) {
    return txsDAL.getTX(hash);
  };

  this.removeTxByHash = function(hash) {
    return txsDAL.removeTX(hash);
  };

  this.getTransactionsPending = function() {
    return txsDAL.getAllPending();
  };

  this.getNonWritten = function(pubkey) {
    return idtyDAL.getPendingIdentities()
      .then(function(pending){
        return _.chain(pending).
          where({ pubkey: pubkey }).
          value();
      });
  };

  this.getToBeKicked = function(done) {
    return idtyDAL.getWhoIsOrWasMember()
      .then(function(membersOnce){
        return _.chain(membersOnce).
          where({ member: true, kick: true }).
          value();
      })
      .then(function(res) {
        done && done(null, res);
        return res;
      }).catch(done);
  };

  this.getWrittenByUID = function(uid) {
    return that.fillIdentityWithCerts(idtyDAL.getFromUID(uid));
  };

  this.searchIdentity = function(search) {
    return Q.all([
      idtyDAL.getWhoIsOrWasMember(),
      idtyDAL.getPendingIdentities()
    ])
      .then(function(res){
        var idties = _.chain(res[0]).
          where({ revoked: false }).
          filter(function(idty){ return idty.pubkey.match(new RegExp(search, 'i')) || idty.uid.match(new RegExp(search, 'i')); }).
          value();
        var pendings = _.chain(res[1]).
          where({ revoked: false }).
          filter(function(idty){ return idty.pubkey.match(new RegExp(search, 'i')) || idty.uid.match(new RegExp(search, 'i')); }).
          value();
        var hashes = _.pluck(idties, 'hash');
        pendings.forEach(function(pending){
          if (hashes.indexOf(pending.hash) == -1) {
            idties.push(pending);
          }
        });
        return idties;
      })
      .then(function(idties){
        return that.fillIdentityWithCerts(Q(idties));
      })
      .then(function(idties){
        return idties;
      });
  };

  this.certsToTarget = function(hash) {
    return certDAL.getToTarget(hash)
      .then(function(certs){
        var matching = _.chain(certs).
          sortBy(function(c){ return -c.block; }).
          value();
        matching.reverse();
        return matching;
      })
      .catch(function(err){
        throw err;
      });
  };

  this.certsFrom = function(pubkey) {
    return certDAL.getFromPubkey(pubkey)
      .then(function(certs){
        return _.chain(certs).
          where({ from: pubkey }).
          sortBy(function(c){ return c.block; }).
          value();
      });
  };

  this.certsFindNew = function() {
    return certDAL.getNotLinked()
      .then(function(certs){
        return _.chain(certs).
          where({ linked: false }).
          sortBy(function(c){ return -c.block; }).
          value();
      });
  };

  this.certsNotLinkedToTarget = function(hash) {
    return certDAL.getNotLinkedToTarget(hash)
      .then(function(certs){
        return _.chain(certs).
          sortBy(function(c){ return -c.block; }).
          value();
      });
  };

  this.getMembershipForHashAndIssuer = function(ms) {
    return msDAL.getMembershipOfIssuer(ms)
      .catch(function(){
        return null;
      });
  };

  this.listPendingLocalMemberships = function() {
    return msDAL.getPendingLocal();
  };

  this.findNewcomers = function() {
    return msDAL.getPendingIN()
      .then(function(mss){
        return _.chain(mss).
          sortBy(function(ms){ return -ms.sigDate; }).
          value();
      });
  };

  this.findLeavers = function() {
    return msDAL.getPendingOUT()
      .then(function(mss){
        return _.chain(mss).
          sortBy(function(ms){ return -ms.sigDate; }).
          value();
      });
  };

  this.existsLinkFromOrAfterDate = function(from, to, maxDate) {
    return linksDAL.getValidLinksFrom(from)
      .then(function(links){
        var matching = _.chain(links).
          where({ target: to }).
          filter(function(lnk){ return lnk.timestamp >= maxDate; }).
          value();
        return matching.length ? true : false;
      });
  };

  this.existsNotConsumed = function(type, pubkey, number, fingerprint, amount) {
    return that.sourcesDAL.isAvailableSource(pubkey, type, number, fingerprint, amount);
  };

  this.isMember = function(pubkey, done) {
    return idtyDAL.getFromPubkey(pubkey)
      .then(function(idty){
        done && done(null, idty.member);
        return true;
      })
      .catch(function(){
        done && done(null, false);
        return false;
      });
  };

  this.isMemberOrError = function(pubkey, done) {
    return idtyDAL.getFromPubkey(pubkey)
      .then(function(idty){
        if (!idty.member) throw 'Problem';
        done && done();
        return true;
      })
      .catch(function(){
        done && done('Is not a member');
        return false;
      });
  };

  this.isLeaving = function(pubkey, done) {
    return idtyDAL.getFromPubkey(pubkey)
      .then(function(idty){
        done && done(null, idty.leaving);
        return true;
      })
      .catch(function(){
        done && done(null, false);
        return false;
      });
  };

  this.isMembeAndNonLeaverOrError = function(pubkey, done) {
    return idtyDAL.getFromPubkey(pubkey)
      .then(function(idty){
        if (!idty.member || idty.leaving) throw 'Problem';
        done && done(null);
        return true;
      })
      .catch(function(){
        done && done('Not a non-leaving member');
        if (!done) {
          throw 'Not a non-leaving member';
        }
      });
  };

  this.existsCert = function(cert) {
    return certDAL.existsGivenCert(cert);
  };

  this.obsoletesLinks = function(minTimestamp) {
    return linksDAL.obsoletesLinks(minTimestamp);
  };

  this.setConsumedSource = function(type, pubkey, number, fingerprint, amount) {
    return that.sourcesDAL.consumeSource(pubkey, type, number, fingerprint, amount);
  };

  this.setKicked = function(pubkey, hash, notEnoughLinks, done) {
    var kick = notEnoughLinks ? true : false;
    return idtyDAL.getFromPubkey(pubkey)
      .then(function(idty){
        if (idty.kick != kick) {
          idty.kick = kick;
          return idtyDAL.saveIdentity(idty);
        }
      })
      .then(function(){
        return that.donable(Q(), done);
      })
      .catch(done);
  };

  this.setRevoked = function(hash, done) {
    return idtyDAL.getByHash(hash)
      .then(function(idty){
        idty.revoked = true;
        return idtyDAL.saveIdentity(idty);
      })
      .then(function(){
        done && done();
      })
      .catch(done);
  };

  this.getMembershipExcludingBlock = function(current, msValidtyTime) {
    return co(function *() {
      var currentExcluding;
      if (current.number > 0) {
        try {
          currentExcluding = yield indicatorsDAL.getCurrentMembershipExcludingBlock();
        } catch(e){
          currentExcluding = null;
        }
      }
      if (!currentExcluding) {
        var root = yield that.getRootBlock();
        var delaySinceStart = current.medianTime - root.medianTime;
        if (delaySinceStart > msValidtyTime) {
          return indicatorsDAL.writeCurrentExcluding(root).thenResolve(root);
        }
      } else {
        var start = currentExcluding.number;
        var nextPotential;
        do {
          nextPotential = yield that.getBlock(start + 1);
          var delaySinceNextOfExcluding = current.medianTime - nextPotential.medianTime;
          if (delaySinceNextOfExcluding > msValidtyTime) {
            yield indicatorsDAL.writeCurrentExcluding(nextPotential).thenResolve(nextPotential);
            start++;
          }
        } while (delaySinceNextOfExcluding > msValidtyTime);
        return nextPotential;
      }
    });
  };

  this.getCertificationExcludingBlock = function(current, certValidtyTime) {
    return co(function *() {
      var currentExcluding;
      if (current.number > 0) {
        try {
          currentExcluding = yield indicatorsDAL.getCurrentCertificationExcludingBlock();
        } catch(e){
          currentExcluding = null;
        }
      }
      if (!currentExcluding) {
        var root = yield that.getRootBlock();
        var delaySinceStart = current.medianTime - root.medianTime;
        if (delaySinceStart > certValidtyTime) {
          return indicatorsDAL.writeCurrentExcludingForCert(root).thenResolve(root);
        }
      } else {
        var start = currentExcluding.number;
        var nextPotential;
        do {
          nextPotential = yield that.getBlock(start + 1);
          var delaySinceNextOfExcluding = current.medianTime - nextPotential.medianTime;
          if (delaySinceNextOfExcluding > certValidtyTime) {
            yield indicatorsDAL.writeCurrentExcludingForCert(nextPotential).thenResolve(nextPotential);
            start++;
          }
        } while (delaySinceNextOfExcluding > certValidtyTime);
        return nextPotential;
      }
    });
  };

  this.kickWithOutdatedMemberships = function(maxNumber) {
    return that.getMembers()
      .then(function(members){
        return Q.all(members.map(function(member) {
          if (member.currentMSN <= maxNumber) {
            return that.setKicked(member.pubkey, null, true);
          }
        }));
      });
  };

  this.getPeerOrNull = function(pubkey, done) {
    return nullIfError(that.getPeer(pubkey), done);
  };

  this.getBlockOrNull = function(number, done) {
    return nullIfError(that.getBlock(number), done);
  };

  this.findAllPeersNEWUPBut = function(pubkeys, done) {
    return that.listAllPeers()
      .then(function(peers){
        return peers.filter(function(peer) {
          return pubkeys.indexOf(peer.pubkey) == -1 && ['UP'].indexOf(peer.status) !== -1;
        });
      })
      .then(function(matchingPeers){
        done && done(null, matchingPeers);
        return matchingPeers;
      })
      .catch(done);
  };

  this.listAllPeersWithStatusNewUP = function() {
    return that.peerDAL.listAll()
      .then(function(peers){
        var matching = _.chain(peers).
          filter(function(p){ return ['UP'].indexOf(p.status) !== -1; }).
          value();
        return Q(matching);
      });
  };

  this.findPeers = function(pubkey) {
    return that.getPeer(pubkey)
      .catch(function(){
        return [];
      })
      .then(function(peer){
        return [peer];
      });
  };

  this.getRandomlyUPsWithout = function(pubkeys, done) {
    return that.listAllPeersWithStatusNewUP()
      .then(function(peers){
        return peers.filter(function(peer) {
          return pubkeys.indexOf(peer.pubkey) == -1;
        });
      })
      .then(function(matchingPeers){
        done && done(null, matchingPeers);
        return matchingPeers;
      })
      .catch(function(err) {
        done && done(err);
        throw err;
      });
  };

  this.setPeerDown = function(pubkey) {
    return that.getPeer(pubkey)
      .then(function(p){
        p.status = 'DOWN';
        return that.peerDAL.savePeer(p);
      })
      .catch(function() {
        // Silent error
      });
  };

  this.saveBlock = function(block, done) {
    return Q()
      .then(function() {
        return Q.all([
          that.saveBlockInFile(block, true),
          that.saveTxsInFiles(block.transactions, { block_number: block.number, time: block.medianTime }),
          that.saveMemberships('join', block.joiners),
          that.saveMemberships('active', block.actives),
          that.saveMemberships('leave', block.leavers)
        ]);
      })
      .then(function(){
        return blockDAL.saveCurrent(block);
      })
      .then(function(){
        if (block.dividend) {
          return indicatorsDAL.setLastUDBlock(block);
        }
      })
      .then(function(){
        return indicatorsDAL.setLastBlockForIssuer(block);
      })
      .then(function(){
        done && done();
      })
      .catch(function(err){
        done && done(err);
        throw err;
      });
  };

  this.saveMemberships = function (type, mss) {
    var msType = type == 'leave' ? 'out' : 'in';
    return mss.reduce(function(p, msRaw) {
      return p.then(function(){
        var ms = Membership.statics.fromInline(msRaw, type == 'leave' ? 'OUT' : 'IN', that.getCurrency());
        ms.type = type;
        ms.hash = String(sha1(ms.getRawSigned())).toUpperCase();
        return msDAL.saveOfficialMS(msType, ms);
      });
    }, Q());
  };

  this.savePendingMembership = function(ms) {
    return msDAL.savePendingMembership(ms);
  };

  that.saveBlockInFile = function(block, check, done) {
    return Q()
      .then(function(){
        return that.writeFileOfBlock(block);
      })
      .then(function(){
        done && done();
      })
      .catch(function(err){
        done && done(err);
        throw err;
      });
  };

  this.saveTxsInFiles = function (txs, extraProps) {
    return Q.all(txs.map(function(tx) {
      _.extend(tx, extraProps);
      _.extend(tx, { currency: that.getCurrency() });
      return txsDAL.addLinked(new Transaction(tx));
    }));
  };

  function donable(promise, done) {
    return promise
      .then(function(){
        done && done();
      })
      .catch(function(err){
        done && done(err);
        throw err;
      });
  }

  this.donable = donable;

  this.merkleForPeers = function(done) {
    return that.listAllPeersWithStatusNewUP()
      .then(function(peers){
        var leaves = peers.map(function(peer) { return peer.hash; });
        var merkle = new Merkle();
        merkle.initialize(leaves);
        done && done(null, merkle);
        return merkle;
      })
      .catch(function(err){
        done && done(err);
        throw err;
      });
  };

  this.saveLink = function(link) {
    return linksDAL.addLink(link);
  };

  this.saveSource = function(src) {
    return (src.type == "D" ? that.saveUDInHistory(src.pubkey, src) : Q())
      .then(function(){
        return that.sourcesDAL.addSource('available', src.pubkey, src.type, src.number, src.fingerprint, src.amount);
      });
  };

  this.officializeCertification = function(cert) {
    return certDAL.saveOfficial(cert)
      .then(function(){
        return certDAL.removeNotLinked(cert);
      });
  };

  this.listLocalPendingIdentities = function() {
    return idtyDAL.listLocalPending();
  };

  this.savePendingIdentity = function(idty) {
    return idtyDAL.savePendingIdentity(idty);
  };

  this.excludeIdentity = function(pubkey) {
    return idtyDAL.excludeIdentity(pubkey);
  };

  this.newIdentity = function(idty, onBlock) {
    return idtyDAL.newIdentity(idty, onBlock);
  };

  this.joinIdentity = function(pubkey, onBlock) {
    return idtyDAL.joinIdentity(pubkey, onBlock);
  };

  this.activeIdentity = function(pubkey, onBlock) {
    return idtyDAL.activeIdentity(pubkey, onBlock);
  };

  this.leaveIdentity = function(pubkey, onBlock) {
    return idtyDAL.leaveIdentity(pubkey, onBlock);
  };

  this.listLocalPendingCerts = function() {
    return certDAL.listLocalPending();
  };

  this.registerNewCertification = function(cert) {
    return certDAL.saveNewCertification(cert);
  };

  this.saveTransaction = function(tx) {
    return txsDAL.addPending(tx);
  };

  this.dropTxRecords = function() {
    return myFS.removeTree(rootPath + '/txs/');
  };

  this.saveUDInHistory = function(pubkey, ud) {
    return myFS.makeTree(rootPath + '/ud_history/')
      .then(function(){
        return myFS.read(rootPath + '/ud_history/' + pubkey + '.json')
          .then(function(data){
            return JSON.parse(data);
          });
      })
      .catch(function(){
        return { history: [] };
      })
      .then(function(obj){
        obj.history.push(new Source(ud).UDjson());
        return myFS.write(rootPath + '/ud_history/' + pubkey + '.json', JSON.stringify(obj, null, ' '));
      });
  };

  this.getTransactionsHistory = function(pubkey) {
    return Q({ sent: [], received: [] })
      .then(function(history){
        history.sending = [];
        history.receiving = [];
        return Q.all([
          txsDAL.getLinkedWithIssuer(pubkey),
          txsDAL.getLinkedWithRecipient(pubkey),
          txsDAL.getPendingWithIssuer(pubkey),
          txsDAL.getPendingWithRecipient(pubkey)
        ])
          .then(function(res){
            history.sent = res[0] || [];
            history.received = res[1] || [];
            history.sending = res[2] || [];
            history.pending = res[3] || [];
          }).thenResolve(history);
      });
  };

  this.getUDHistory = function(pubkey, done) {
    return myFS.makeTree(rootPath + '/ud_history/')
      .then(function(){
        return myFS.read(rootPath + '/ud_history/' + pubkey + '.json')
          .then(function(data){
            return JSON.parse(data);
          });
      })
      .catch(function(){
        return { history: [] };
      })
      .then(function(obj){
        return Q.all(obj.history.map(function(src) {
          var completeSrc = _.extend({}, src);
          return that.sourcesDAL.getSource(pubkey, 'D', src.block_number)
            .then(function(foundSrc){
              _.extend(completeSrc, foundSrc);
            });
        }))
          .then(function(){
            done && done(null, obj);
            return obj;
          });
      })
      .catch(function(err){
        done && done(err);
        throw err;
      });
  };

  this.savePeer = function(peer) {
    return that.peerDAL.savePeer(peer);
  };

  /***********************
   *    IO functions
   **********************/

  function ioRead(someFunction) {
    that.readFunctions.push(someFunction);
    return someFunction;
  }

  function ioWrite(someFunction) {
    that.writeFunctions.push(someFunction);
    return someFunction;
  }

  function existsFunc(filePath) {
    return myFS.exists(rootPath + '/' + filePath);
  }

  function listFunc(filePath) {
    return myFS.list(rootPath + '/' + filePath)
      .then(function(files){
        return files.map(function(fileName) {
          return { core: that.name, file: fileName };
        });
      })
      .catch(function() {
        return [];
      });
  }

  var readFunc = function readFunc(filePath) {
    return myFS.read(rootPath + '/' + filePath)
      .then(function(data){
        return JSON.parse(data);
      });
  };

  var writeFunc = function writeFunc(filePath, what) {
    return myFS.write(rootPath + '/' + filePath, JSON.stringify(what, null, ' '));
  };

  var removeFunc = function removeFunc(filePath, what) {
    return myFS.remove(rootPath + '/' + filePath, JSON.stringify(what, null, ' '));
  };

  //function profileFunc(f, name) {
  //  return function() {
  //    var start = new Date();
  //    var args = Array.prototype.slice.call(arguments);
  //    return f.apply(f, args)
  //      .tap(function() {
  //        console.log('%s %s (%sms)', name, args[0], (new Date().getTime() - start.getTime()));
  //      });
  //  };
  //}
  //
  //// Log profiling for CRUD functions
  //readFunc = profileFunc(readFunc, 'Read');
  //writeFunc = profileFunc(writeFunc, 'Write');
  //removeFunc = profileFunc(removeFunc, 'Remove');

  function makeTreeFunc(filePath) {
    return myFS.makeTree(rootPath + '/' + filePath);
  }

  this.setExists = function(existsF) {
    _.values(that.dals).forEach(function(dal){
      dal.setExists(existsF);
    });
    that.existsFile = existsF;
  };

  this.setList = function(listF) {
    _.values(that.dals).forEach(function(dal){
      dal.setList(listF);
    });
    that.listFile = listF;
  };

  this.setRead = function(readF) {
    _.values(that.dals).forEach(function(dal){
      dal.setRead(readF);
    });
    that.readFile = readF;
  };

  this.setWrite = function(writeF) {
    _.values(that.dals).forEach(function(dal){
      dal.setWrite(writeF);
    });
    that.writeFile = writeF;
  };

  this.setRemove = function(removeF) {
    _.values(that.dals).forEach(function(dal){
      dal.setRemove(removeF);
    });
    that.removeFile = removeF;
  };

  this.setMakeTree = function(makeTreeF) {
    _.values(that.dals).forEach(function(dal){
      dal.setMakeTree(makeTreeF);
    });
    that.makeTreeFile = makeTreeF;
  };

  this.setExists(existsFunc);
  this.setList(listFunc);
  this.setRead(readFunc);
  this.setWrite(writeFunc);
  this.setRemove(removeFunc);
  this.setMakeTree(makeTreeFunc);

  /***********************
   *    CONFIGURATION
   **********************/

  this.getParameters = function() {
    return confDAL.getParameters();
  };

  this.loadConf = ioRead(function(overrideConf) {
    return confDAL.loadConf()
      .then(function(conf){
        conf = _(conf).extend(overrideConf || {});
        currency = conf.currency;
        return conf;
      });
  });

  this.saveConf = ioWrite(function(confToSave) {
    currency = confToSave.currency;
    return confDAL.saveConf(confToSave);
  });

  /***********************
   *     STATISTICS
   **********************/

  this.loadStats = ioRead(statDAL.loadStats);
  this.getStat = ioRead(statDAL.getStat);
  this.saveStat = ioWrite(statDAL.saveStat);

  this.close = function() {
    // TODO
  };

  this.resetAll = function(done) {
    var files = ['stats', 'cores', 'current', 'conf'];
    var dirs  = ['blocks', 'ud_history', 'branches', 'certs', 'txs', 'cores', 'sources', 'links', 'ms', 'identities', 'peers', 'indicators'];
    return resetFiles(files, dirs, done);
  };

  this.resetData = function(done) {
    var files = ['stats', 'cores', 'current'];
    var dirs  = ['blocks', 'ud_history', 'branches', 'certs', 'txs', 'cores', 'sources', 'links', 'ms', 'identities', 'peers', 'indicators'];
    return resetFiles(files, dirs, done);
  };

  this.resetConf = function(done) {
    var files = ['conf'];
    var dirs  = [];
    return resetFiles(files, dirs, done);
  };

  this.resetStats = function(done) {
    var files = ['stats'];
    var dirs  = ['ud_history'];
    return resetFiles(files, dirs, done);
  };

  this.resetPeers = function(done) {
    var files = [];
    var dirs  = ['peers'];
    return resetFiles(files, dirs, done);
  };

  this.resetTransactions = function(done) {
    var files = [];
    var dirs  = ['txs'];
    return resetFiles(files, dirs, done);
  };

  function resetFiles(files, dirs, done) {
    return Q.all([

      // Remove files
      Q.all(files.map(function(fName) {
        return myFS.exists(rootPath + '/' + fName + '.json')
          .then(function(exists){
            return exists ? myFS.remove(rootPath + '/' + fName + '.json') : Q();
          });
      })),

      // Remove directories
      Q.all(dirs.map(function(dirName) {
        return myFS.exists(rootPath + '/' + dirName)
          .then(function(exists){
            return exists ? myFS.removeTree(rootPath + '/' + dirName) : Q();
          });
      }))
    ])
      .then(function(){
        done && done();
      })
      .catch(function(err){
        done && done(err);
      });
  }
}
