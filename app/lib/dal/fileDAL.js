"use strict";
var Q       = require('q');
var co      = require('co');
var _       = require('underscore');
var sha1    = require('sha1');
var path    = require('path');
var levelup = require('levelup');
var Membership = require('../entity/membership');
var Merkle = require('../entity/merkle');
var Transaction = require('../entity/transaction');
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
var DividendDAL = require('./fileDALs/DividendDAL');
var LevelDBStorage = require('./fileDALs/AbstractLevelDB');
var CFSStorage = require('./fileDALs/AbstractCFS');
var lokijs = require('lokijs');

module.exports = {
  memory: function(profile) {
    return getHomeFS(profile, true)
      .then(function(params) {
        let levelupInstance = () => levelup({ db: require('memdown') });
        let loki = new lokijs('ucoin', { autosave: false });
        return Q(new FileDAL(profile, params.home, "", params.fs, null, levelupInstance, 'fileDal', null, loki));
      });
  },
  file: function(profile, forConf) {
    return getHomeFS(profile, false)
      .then(function(params) {
        let levelupInstance = (pathToLevelDB) => levelup(pathToLevelDB, { db: require('leveldown') });
        if (forConf) {
          // Memory only service dals
          levelupInstance = () => levelup({ db: require('memdown') });
        }
        return new FileDAL(profile, params.home, "", params.fs, null, levelupInstance);
      });
  },
  FileDAL: FileDAL
};

function someDelayFix() {
  return Q.Promise(function(resolve){
    setTimeout(resolve, 100);
  });
}

function getHomeFS(profile, isMemory) {
  let userHome = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
  let home = userHome + '/.config/ucoin/' + profile;
  let fs;
  return someDelayFix()
    .then(function() {
      fs = (isMemory ? require('q-io/fs-mock')({}) : require('q-io/fs'));
      return fs.makeTree(home);
    })
    .then(function(){
      return { fs: fs, home: home };
    });
}

function FileDAL(profile, home, localDir, myFS, parentFileDAL, levelupInstance, dalName, core, loki) {

  var that = this;

  let localHome = path.join(home, localDir);
  let levelDBPath = path.join(localHome, 'leveldb');
  let myDB = levelupInstance(levelDBPath);

  this.name = dalName;
  this.profile = profile;
  this.parentDAL = parentFileDAL;
  this.core = core;

  var rootPath = home;

  // DALs
  this.confDAL = new ConfDAL(rootPath, myFS, parentFileDAL && parentFileDAL.confDAL.coreFS, that, CFSStorage);
  this.peerDAL = new PeerDAL(rootPath, myFS, parentFileDAL && parentFileDAL.peerDAL.coreFS, that, CFSStorage);
  this.sourcesDAL = new SourcesDAL(rootPath, myDB, parentFileDAL && parentFileDAL.sourcesDAL.coreFS, that, LevelDBStorage);
  this.blockDAL = new BlockDAL(that, loki);
  this.txsDAL = new TxsDAL(rootPath, myDB, parentFileDAL && parentFileDAL.txsDAL.coreFS, that, LevelDBStorage);
  this.indicatorsDAL = new IndicatorsDAL(rootPath, myDB, parentFileDAL && parentFileDAL.indicatorsDAL.coreFS, that, LevelDBStorage);
  this.statDAL = new StatDAL(rootPath, myDB, parentFileDAL && parentFileDAL.statDAL.coreFS, that, LevelDBStorage);
  this.coresDAL = new CoresDAL(rootPath, myDB, parentFileDAL && parentFileDAL.coresDAL.coreFS, that, LevelDBStorage);
  this.linksDAL = new LinksDAL(rootPath, myDB, parentFileDAL && parentFileDAL.linksDAL.coreFS, that, LevelDBStorage);
  this.idtyDAL = new IdentityDAL(rootPath, myDB, parentFileDAL && parentFileDAL.idtyDAL.coreFS, that, LevelDBStorage);
  this.certDAL = new CertDAL(rootPath, myDB, parentFileDAL && parentFileDAL.certDAL.coreFS, that, LevelDBStorage);
  this.msDAL = new MembershipDAL(rootPath, myDB, parentFileDAL && parentFileDAL.msDAL.coreFS, that, LevelDBStorage);
  this.udDAL = new DividendDAL(rootPath, myDB, parentFileDAL && parentFileDAL.udDAL.coreFS, that, LevelDBStorage);

  this.newDals = {
    'peerDAL': that.peerDAL,
    'sourcesDAL': that.sourcesDAL,
    'certDAL': that.certDAL,
    'txsDAL': that.txsDAL,
    'indicatorsDAL': that.indicatorsDAL,
    'confDAL': that.confDAL,
    'statDAL': that.statDAL,
    'coresDAL': that.coresDAL,
    'linksDAL': that.linksDAL,
    'msDAL': that.msDAL,
    'idtyDAL': that.idtyDAL
  };

  var currency = '';

  this.init = (overrideConf) => {
    return co(function *() {
      yield _.values(that.newDals).map((dal) => dal.init());
      return yield that.loadConf(overrideConf);
    });
  };

  this.dumpDB = () => co(function *() {
    let dump = {};
    return Q.Promise(function(resolve, reject){
      myDB.createReadStream()
        .on('data', function (data) {
          dump[data.key] = data.value;
        })
        .on('error', function (err) {
          reject(err);
        })
        .on('close', function () {
          reject('Stream closed');
        })
        .on('end', function () {
          resolve(dump);
        });
    });
  });

  this.loadDump = (dump) => co(function *() {
    let keys = _.keys(dump);
    let operations = keys.map((key) => { return {
        type: 'put',
        key: key,
        value: dump[key]
      };
    });
    return Q.Promise(function(resolve, reject){
      myDB.batch(operations, null, function(err) {
        if (err) {
          return reject(err);
        }
        resolve();
      });
    });
  });

  this.getCurrency = function() {
    return currency;
  };

  this.removeHome = function() {
    return myFS.removeTree(localHome)
      .catch(function(){
        if (myDB.destroy) {
          //return Q.nbind(myDB.destroy, myDB)(levelDBPath);
        }
      });
  };

  that.writeFileOfBlock = function(block) {
    return that.blockDAL.saveBlock(block);
  };

  this.getCores = function() {
    return that.coresDAL.getCores();
  };

  this.loadCore = function(core) {
    return co(function *() {
      let coreName = [core.forkPointNumber, core.forkPointHash].join('-');
      let coreHome = home + '/branches/' + coreName;
      yield myFS.makeTree(coreHome);
      var theCore = require('./coreDAL')(profile, home, coreName, myFS, that, levelupInstance, core, loki);
      yield theCore.init();
      return theCore;
    });
  };

  this.addCore = function(core) {
    return that.coresDAL.addCore(core);
  };

  this.fork = function(newBlock) {
    var core = {
      forkPointNumber: parseInt(newBlock.number),
      forkPointHash: newBlock.hash,
      forkPointPreviousHash: newBlock.previousHash
    };
    return that.coresDAL.getCore(core)
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
        return that.coresDAL.removeCore(core)
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
    return that.blockDAL.getBlock(number)
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
    return that.indicatorsDAL.getLastUDBlock();
  };

  this.getRootBlock = function(done) {
    return that.getBlock(0, done);
  };

  this.lastBlockOfIssuer = function(issuer) {
    return that.indicatorsDAL.getLastBlockOfIssuer(issuer);
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
    return that.blockDAL.getCurrent()
      .then((block) => block.number)
      .catch(function() {
        return -1;
      });
  };

  this.getLastSavedBlockFileNumber = function() {
    return that.blockDAL.getLastSavedBlockFileNumber();
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
    return that.linksDAL.getValidLinksFrom(from);
  };

  this.getValidLinksTo = function(to) {
    return that.linksDAL.getValidLinksTo(to);
  };

  this.getObsoletesFromTo = function(from, to) {
    return that.linksDAL.getObsoletes()
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
    return that.idtyDAL.getByHash(hash)
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

  this.getIdentityByHashWithCertsOrNull = function(hash) {
    return that.getIdentityByHashOrNull(hash)
      .catch(function(){
        return null;
      })
      .then(function(idty){
        return that.fillIdentityWithCerts(idty);
      });
  };

  this.fillIdentitiesWithCerts = function(idties) {
    return idties.reduce(function(p, aIdty) {
      return that.certDAL.getToTarget(aIdty.hash)
        .then(function(certs){
          aIdty.certs = certs;
          return Q();
        });
    }, Q())
      .then(() => idties);
  };

  this.fillIdentityWithCerts = function(idty) {
    if (!idty) {
      return Q(null);
    }
    return that.certDAL.getToTarget(idty.hash)
      .then(function(certs){
        idty.certs = certs;
        return idty;
      });
  };

  this.getMembers = function(done) {
    return that.idtyDAL.getWhoIsOrWasMember()
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
      that.idtyDAL.getFromPubkey(pubkey)
        .then(function(idty){
          return idty;
        }).catch(function() {
          return null;
        }), done);
  };

  this.fillInMembershipsOfIdentity = function(queryPromise, done) {
    return Q(queryPromise)
      .then(function(idty){
        if (idty) {
          return that.msDAL.getMembershipsOfIssuer(idty.pubkey)
            .then(function(mss){
              idty.memberships = mss;
              return idty;
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
    return that.msDAL.getMembershipsOfIssuer(pubkey);
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
    return that.txsDAL.getTX(hash);
  };

  this.removeTxByHash = function(hash) {
    return that.txsDAL.removeTX(hash);
  };

  this.getTransactionsPending = function() {
    return that.txsDAL.getAllPending();
  };

  this.getNonWritten = function(pubkey) {
    return that.idtyDAL.getPendingIdentities()
      .then(function(pending){
        return _.chain(pending).
          where({ pubkey: pubkey }).
          value();
      });
  };

  this.getToBeKicked = function(done) {
    return that.idtyDAL.getWhoIsOrWasMember()
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

  this.getToBeKickedPubkeys = function() {
    return co(function *() {
      var exclusions = yield that.getToBeKicked();
      return _.pluck(exclusions, 'pubkey');
    });
  };

  this.getWrittenByUID = function(uid) {
    return that.idtyDAL.getFromUID(uid)
      .catch(function(){
        return null;
      })
      .then(function(idty){
        return that.fillIdentityWithCerts(idty);
      });
  };

  this.searchIdentity = function(search) {
    return Q.all([
      that.idtyDAL.getWhoIsOrWasMember(),
      that.idtyDAL.getPendingIdentities()
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
        return that.fillIdentitiesWithCerts(idties);
      });
  };

  this.searchJustIdentities = function(search) {
    return Q.all([
      that.idtyDAL.getWhoIsOrWasMember(),
      that.idtyDAL.getPendingIdentities()
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
      });
  };

  this.certsToTarget = function(hash) {
    return that.certDAL.getToTarget(hash)
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
    return that.certDAL.getFromPubkey(pubkey)
      .then(function(certs){
        return _.chain(certs).
          where({ from: pubkey }).
          sortBy(function(c){ return c.block; }).
          value();
      });
  };

  this.certsFindNew = function() {
    return that.certDAL.getNotLinked()
      .then(function(certs){
        return _.chain(certs).
          where({ linked: false }).
          sortBy(function(c){ return -c.block; }).
          value();
      });
  };

  this.certsNotLinkedToTarget = function(hash) {
    return that.certDAL.getNotLinkedToTarget(hash)
      .then(function(certs){
        return _.chain(certs).
          sortBy(function(c){
            //console.log(hash);
            //console.log(certs);
            return -c.block; }).
          value();
      });
  };

  this.getMembershipForHashAndIssuer = function(ms) {
    return that.msDAL.getMembershipOfIssuer(ms)
      .catch(function(){
        return null;
      });
  };

  this.listPendingLocalMemberships = function() {
    return that.msDAL.getPendingLocal();
  };

  this.findNewcomers = function() {
    return that.msDAL.getPendingIN()
      .then(function(mss){
        return _.chain(mss).
          sortBy(function(ms){ return -ms.sigDate; }).
          value();
      });
  };

  this.findLeavers = function() {
    return that.msDAL.getPendingOUT()
      .then(function(mss){
        return _.chain(mss).
          sortBy(function(ms){ return -ms.sigDate; }).
          value();
      });
  };

  this.existsLinkFromOrAfterDate = function(from, to, maxDate) {
    return co(function *() {
      var links = yield that.linksDAL.getValidLinksFrom(from);
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
    return that.idtyDAL.getFromPubkey(pubkey)
      .then(function(idty){
        done && done(null, idty.member);
        return idty.member;
      })
      .catch(function(){
        done && done(null, false);
        return false;
      });
  };

  this.isLeaving = function(pubkey, done) {
    return that.idtyDAL.getFromPubkey(pubkey)
      .then(function(idty){
        done && done(null, idty.leaving);
        return true;
      })
      .catch(function(){
        done && done(null, false);
        return false;
      });
  };

  this.isMemberAndNonLeaver = function(pubkey) {
    return that.idtyDAL.getFromPubkey(pubkey)
      .catch(() => false)
      .then((idty) => (idty && idty.member && !idty.leaving) || false);
  };

  this.existsCert = function(cert) {
    return that.certDAL.existsGivenCert(cert);
  };

  this.obsoletesLinks = function(minTimestamp) {
    return that.linksDAL.obsoletesLinks(minTimestamp);
  };

  this.setConsumedSource = function(type, pubkey, number, fingerprint, amount) {
    return that.sourcesDAL.consumeSource(pubkey, type, number, fingerprint, amount);
  };

  this.setKicked = function(pubkey, hash, notEnoughLinks, done) {
    var kick = notEnoughLinks ? true : false;
    return that.idtyDAL.getFromPubkey(pubkey)
      .then(function(idty){
        if (idty.kick != kick) {
          idty.kick = kick;
          return that.idtyDAL.saveIdentity(idty);
        }
      })
      .then(function(){
        return that.donable(Q(), done);
      })
      .catch(done);
  };

  this.setRevoked = function(hash, done) {
    return that.idtyDAL.getByHash(hash)
      .then(function(idty){
        idty.revoked = true;
        return that.idtyDAL.saveIdentity(idty);
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
          currentExcluding = yield that.indicatorsDAL.getCurrentMembershipExcludingBlock();
        } catch(e){
          currentExcluding = null;
        }
      }
      if (!currentExcluding) {
        var root = yield that.getRootBlock();
        var delaySinceStart = current.medianTime - root.medianTime;
        if (delaySinceStart > msValidtyTime) {
          return that.indicatorsDAL.writeCurrentExcluding(root).then(() => root);
        }
      } else {
        var start = currentExcluding.number;
        var nextPotential;
        do {
          nextPotential = yield that.getBlock(start + 1);
          var delaySinceNextOfExcluding = current.medianTime - nextPotential.medianTime;
          if (delaySinceNextOfExcluding > msValidtyTime) {
            yield that.indicatorsDAL.writeCurrentExcluding(nextPotential).then(() => nextPotential);
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
          currentExcluding = yield that.indicatorsDAL.getCurrentCertificationExcludingBlock();
        } catch(e){
          currentExcluding = null;
        }
      }
      if (!currentExcluding) {
        var root = yield that.getRootBlock();
        var delaySinceStart = current.medianTime - root.medianTime;
        if (delaySinceStart > certValidtyTime) {
          return that.indicatorsDAL.writeCurrentExcludingForCert(root).then(() => root);
        }
      } else {
        var start = currentExcluding.number;
        var nextPotential;
        do {
          nextPotential = yield that.getBlock(start + 1);
          var delaySinceNextOfExcluding = current.medianTime - nextPotential.medianTime;
          if (delaySinceNextOfExcluding > certValidtyTime) {
            yield that.indicatorsDAL.writeCurrentExcludingForCert(nextPotential).then(() => nextPotential);
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
          if (member.currentMSN < maxNumber) {
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
        if (block.dividend) {
          return that.indicatorsDAL.setLastUDBlock(block);
        }
      })
      .then(function(){
        return that.indicatorsDAL.setLastBlockForIssuer(block);
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
        return that.msDAL.saveOfficialMS(msType, ms);
      });
    }, Q());
  };

  this.savePendingMembership = function(ms) {
    return that.msDAL.savePendingMembership(ms);
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
      return that.txsDAL.addLinked(new Transaction(tx));
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
    return that.linksDAL.addLink(link);
  };

  this.saveSource = function(src) {
    return (src.type == "D" ? that.saveUDInHistory(src.pubkey, src) : Q())
      .then(function(){
        return that.sourcesDAL.addSource('available', src.pubkey, src.type, src.number, src.fingerprint, src.amount);
      });
  };

  this.officializeCertification = function(cert) {
    return that.certDAL.saveOfficial(cert)
      .then(function(){
        return that.certDAL.removeNotLinked(cert);
      });
  };

  this.listLocalPendingIdentities = function() {
    return that.idtyDAL.listLocalPending();
  };

  this.savePendingIdentity = function(idty) {
    return that.idtyDAL.savePendingIdentity(idty);
  };

  this.excludeIdentity = function(pubkey) {
    return that.idtyDAL.excludeIdentity(pubkey);
  };

  this.newIdentity = function(idty, onBlock) {
    return that.idtyDAL.newIdentity(idty, onBlock);
  };

  this.joinIdentity = function(pubkey, onBlock) {
    return that.idtyDAL.joinIdentity(pubkey, onBlock);
  };

  this.activeIdentity = function(pubkey, onBlock) {
    return that.idtyDAL.activeIdentity(pubkey, onBlock);
  };

  this.leaveIdentity = function(pubkey, onBlock) {
    return that.idtyDAL.leaveIdentity(pubkey, onBlock);
  };

  this.listLocalPendingCerts = function() {
    return that.certDAL.listLocalPending();
  };

  this.registerNewCertification = function(cert) {
    return that.certDAL.saveNewCertification(cert);
  };

  this.saveTransaction = function(tx) {
    return that.txsDAL.addPending(tx);
  };

  this.saveUDInHistory = function(pubkey, ud) {
    return that.udDAL.saveUDInHistory(pubkey, ud);
  };

  this.getTransactionsHistory = function(pubkey) {
    return Q({ sent: [], received: [] })
      .then(function(history){
        history.sending = [];
        history.receiving = [];
        return Q.all([
          that.txsDAL.getLinkedWithIssuer(pubkey),
          that.txsDAL.getLinkedWithRecipient(pubkey),
          that.txsDAL.getPendingWithIssuer(pubkey),
          that.txsDAL.getPendingWithRecipient(pubkey)
        ])
          .then(function(res){
            history.sent = res[0] || [];
            history.received = res[1] || [];
            history.sending = res[2] || [];
            history.pending = res[3] || [];
          }).then(() => history);
      });
  };

  this.getUDHistory = function(pubkey, done) {
    return that.udDAL.getUDHistory(pubkey)
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
   *    CONFIGURATION
   **********************/

  this.getParameters = function() {
    return that.confDAL.getParameters();
  };

  this.loadConf = function(overrideConf) {
    return that.confDAL.loadConf()
      .then(function(conf){
        conf = _(conf).extend(overrideConf || {});
        currency = conf.currency;
        return conf;
      });
  };

  this.saveConf = function(confToSave) {
    currency = confToSave.currency;
    return that.confDAL.saveConf(confToSave);
  };

  /***********************
   *     STATISTICS
   **********************/

  this.loadStats = that.statDAL.loadStats;
  this.getStat = that.statDAL.getStat;
  this.saveStat = that.statDAL.saveStat;

  this.close = function() {
    // TODO
  };

  this.resetAll = function(done) {
    var files = ['stats', 'cores', 'current', 'conf'];
    var dirs  = ['blocks', 'ud_history', 'branches', 'certs', 'txs', 'cores', 'sources', 'links', 'ms', 'identities', 'peers', 'indicators', 'leveldb'];
    return resetFiles(files, dirs, done);
  };

  this.resetData = function(done) {
    var files = ['stats', 'cores', 'current'];
    var dirs  = ['blocks', 'ud_history', 'branches', 'certs', 'txs', 'cores', 'sources', 'links', 'ms', 'identities', 'peers', 'indicators', 'leveldb'];
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
