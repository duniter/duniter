var jpgp      = require('../lib/jpgp');
var async     = require('async');
var _         = require('underscore');
var openpgp   = require('openpgp');
var merkle    = require('merkle');
var base64    = require('../lib/base64');
var unix2dos  = require('../lib/unix2dos');
var dos2unix  = require('../lib/dos2unix');
var parsers   = require('../lib/streams/parsers/doc');
var keyhelper = require('../lib/keyhelper');
var logger    = require('../lib/logger')('membership');
var moment    = require('moment');

module.exports.get = function (conn, conf, PublicKeyService) {
  return new KeyService(conn, conf, PublicKeyService);
};

function KeyService (conn, conf, PublicKeyService) {

  var KeychainService = this;

  var Membership = conn.model('Membership');
  var KeyBlock   = conn.model('KeyBlock');
  var PublicKey  = conn.model('PublicKey');
  var Link       = conn.model('Link');
  var Key        = conn.model('Key');

  var MINIMUM_ZERO_START = 1;
  var LINK_QUANTITY_MIN = 1;
  var MAX_STEPS = 1;
  var MAX_LINK_VALIDITY = 3600*24*30; // 30 days

  this.load = function (done) {
    done();
  };

  this.submitMembership = function (ms, done) {
    var entry = new Membership(ms);
    async.waterfall([
      function (next){
        logger.debug('⬇ %s %s', entry.issuer, entry.membership);
        // Get already existing Membership with same parameters
        Membership.getForHashAndIssuer(entry.hash, entry.issuer, next);
      },
      function (entries, next){
        if (entries.length > 0 && entries[0].date > entry.date) {
          next('Already received membership');
        }
        else Key.isMember(entry.issuer, next);
      },
      function (isMember, next){
        var isJoin = entry.membership == 'IN';
        if (!isMember && isJoin) {
          hasEligiblePubkey(entry.issuer, next);
        }
        else if (isMember && !isJoin) {
          next(null, true);
        } else {
          if (isJoin)
            next('A member cannot join in.');
          else 
            next('A non-member cannot leave.');
        }
      },
      function (isClean, next){
        if (!isClean) {
          next('Needs an eligible public key (with udid2)');
          return;
        }
        Membership.removeEligible(entry.issuer, next);
      },
      function (nbDeleted, next) {
        // Saves entry
        entry.save(function (err) {
          next(err);
        });
      },
      function (next){
        logger.debug('✔ %s %s', entry.issuer, entry.membership);
        next(null, entry);
      }
    ], done);
  };

  function hasEligiblePubkey (fpr, done) {
    async.waterfall([
      function (next){
        PublicKey.getTheOne(fpr, next);
      },
      function (pubkey, next){
        if (pubkey.keychain)
          next(null, true); // Key is already in the chain
        else {
          // Key is not in the keychain: valid if it has a valid udid2 (implying pubkey + self certificatio)
          var wrappedKey = keyhelper.fromArmored(pubkey.raw);
          next(null, wrappedKey.hasValidUdid2());
        }
      },
    ], done);
  }

  this.submitKeyBlock = function (kb, done) {
    var block = new KeyBlock(kb);
    var currentBlock = null;
    async.waterfall([
      function (next){
        KeyBlock.current(function (err, kb) {
          next(null, kb || null);
        })
      },
      function (current, next){
        // Testing chaining
        if (!current && block.number > 0) {
          next('Requires root block first');
          return;
        }
        if (current && block.number <= current.number) {
          next('Too late for this block');
          return;
        }
        if (current && block.number > current.number + 1) {
          next('Too early for this block');
          return;
        }
        if (current && block.number == current.number + 1 && block.previousHash != current.hash) {
          next('PreviousHash does not target current block');
          return;
        }
        if (current && block.number == current.number + 1 && block.previousIssuer != current.issuer) {
          next('PreviousIssuer does not target current block');
          return;
        }
        current = currentBlock;
        // Check the challenge depending on issuer
        checkProofOfWork(block, next);
      },
      function (next) {
        // Check document's coherence
        checkCoherence(currentBlock, block, next);
      },
      function (next) {
        // Save block data + compute links obsolescence
        saveBlockData(block, next);
      }
    ], done);
  };

  function checkCoherence (current, block, done) {
    async.waterfall([
      function (next) {
        // Check that to be kicked members are kicked
        checkKicked(block, next);
      },
      function (next){
        // Check memberships
        checkMemberships(current, block, next);
      },
      function (next){
        // Check certifications updates
        checkCertificationsUpdates(block, next);
      },
      function (next){
        // Check members' changes (+ and -), root & count
        checkCommunityChanges(block, next);
      },
    ], function (err) {
      done(err);
    });
  }

  function checkMemberships (current, block, done) {
    // Test membership
    var basicPubkeys = block.getBasicPublicKeys();
    var findEligiblePubkey = async.apply(getValidMemberPubkey, current ? current.timestamp : null, block);
    var msExtracted = block.getMemberships();
    async.waterfall([
      function (next){
        // Test no orphan signature
        if (msExtracted.notFoundMembership > 0)
          next('Orphan signatures found (not linked with membership)');
        // Test no orphan membership
        var mss = msExtracted.mss;
        _(mss).values().forEach(function(ms){
          if (!ms.signature) {
            next('Orphan membership found (not linked with signature)');
            return;
          }
        });
        // Test orphan pubkeys (must have a membership)
        basicPubkeys.forEach(function(bPubkey){
          var keyID = bPubkey.getKeyPacket().getFingerprint().toUpperCase().substring(24);
          if (!mss[keyID]) {
            next('Orphan pubkey: requires a membership');
            return;
          }
        });
        async.forEach(_(mss).values(), function(ms, callback){
          // Find good key + verify membership signature
          var entity = new Membership(ms);
          async.waterfall([
            function (next){
              findEligiblePubkey(ms.fingerprint, next);
            },
            function (armoredPubkey, next){
              entity.currency = conf.currency;
              entity.userid = jpgp().certificate(armoredPubkey).userid;
              jpgp()
                .publicKey(armoredPubkey)
                .data(entity.getRaw())
                .signature(ms.signature)
                .verify(next);
            },
            function (verified, next) {
              if(!verified){
                next('Bad signature for document');
                return;
              }
              next();
            },
          ], callback);
        }, next);
      },
    ], done);
  }

  /**
  * Find the pubkey matching fingerprint + test its validity against WoT constraints (signatures).
  **/
  function getValidMemberPubkey (now, block, fingerprint, done) {
    var wotKey;
    async.waterfall([
      function (next){
        getMemberOrNewcomerPubkey(block, fingerprint, next);
      },
      function (wotPubkey, next) {
        wotKey = wotPubkey;
        // Check signatures' quantity + distance to WoT
        var nbLinks = wotKey.getSignatories().length;
        // wotKey.getSignatories().forEach(function(link){
        //   if (Math.max(now - link.timestamp, 0) < LINK_DURATION) {
        //     nbLinks++;
        //   }
        // });
        // Check against quantity
        if (block.number > 0 && nbLinks < LINK_QUANTITY_MIN) {
          next('Not enough links to join the Web of Trust');
          return;
        }
        Key.getMembers(next);
      },
      function (members, next){
        // Check against distance to the WoT
        async.forEach(members, function(member, callback){
          findExistingPath(wotKey, member, MAX_STEPS, callback);
        }, next);
      },
      function (next){
        next(null, wotKey.armor());
      },
    ], done);
  }

  /**
  * Find a member's pubkey, wether it is in the memory block or persisted keychain,
  * and returns it as WOTPubkey object.
  **/
  function getMemberOrNewcomerPubkey (block, fingerprint, done) {
    var wotPubkey;
    block.publicKeys.forEach(function(pk){
      if (pk.fingerprint == fingerprint)
        wotPubkey = new WOTPubkey(fingerprint, pk.packets);
    });
    // New PubKey
    if (wotPubkey) {
      async.waterfall([
        function (next) {
          // Check each pubkey packet has a UserID, and only one
          // Check the self-certification exists with pubkey
          // Only one self-certification
          if (!wotPubkey.hasOnlyOneValidUserID()) {
            next('One and only one UserID required & allowed for a pubkey');
            return;
          }
          if (wotPubkey.getSelfCertifications().length != 1) {
            next('Only one self certification allowed for a key');
            return;
          }
          // Check each pubkey is here for first time
          // Check no KeyID conflict
          Key.isMember(fingerprint.substring(24), next);
        },
        function (isMember, next){
          if (isMember) {
            next('Cannot add a pubkey for an existing member');
            return;
          }
          // Check signatures (good signature + from member)
          if (block.number == 0) {
            // No tier-signature allowed (no existing member to justify it)
            if (wotPubkey.getSignatories().length > 0) {
              next('No tier-certification allowed for root keyblock');
              return;
            }
            else next();
          }
          else {
            async.forEach(wotPubkey.getSignatories(), function(signatory, callback){
              async.waterfall([
                function (next){
                  getMemberPubkey(signatory.keyID, next);
                },
                function (wotKey, next){
                  // Tiers certif: only from members
                  if (!signatory.packet.verify(wotPubkey.userid, tierPubkey)) {
                    next('Signature verification failed for userid');
                    return;
                  }
                  next();
                },
              ], callback);
            }, next);
          }
        },
      ], function (err) {
        done(err, wotPubkey);
      });
    }
    else {
      // Existing pubkey
      async.waterfall([
        function (next){
          PublicKey.getTheOne(fingerprint, next);
        },
        function (pubk, next){
          next(null, new WOTPubkey(fingerprint, pubk.keychain));
        },
        function (wotPubk, next){
          var certifs = block.getTierCertificationPacketsFor(wotPubk.fingerprint);
          wotPubk.addAll(certifs);
          next(null, wotPubk);
        },
      ], done);
    }
  }

  function checkProofOfWork (block, done) {
    var powRegexp = new RegExp('^0{' + MINIMUM_ZERO_START + '}');
    if (!block.hash.match(powRegexp))
      done('Not a proof-of-work');
    else
      done();
  }

  /**
  * Find a member's pubkey, wether it is in the memory block or persisted keychain,
  * and returns it as WOTPubkey object.
  **/
  function getMemberPubkey (fingerprint, done) {
    async.waterfall([
      function (next){
        Key.isMember(fingerprint, next);
      },
      function (isMember, next){
        if (!isMember) {
          next('Not a member key');
          return;
        }
        PublicKey.getTheOne(fingerprint, next);
      },
      function (pubkey, next){
        next(null, new WOTPubkey(fingerprint, pubkey.keychain));
      },
    ], done);
  }

  function findExistingPath(wotKey, member, maxSteps, callback) {
    callback('No path found!');
  }

  function checkKicked (block, done) {
    async.waterfall([
      function (next){
        Key.getToBeKicked(next);
      },
      function (keys, next){
        var changes = block.membersChanges;
        keys.forEach(function(key){
          if (changes.indexOf('-' + key.fingerprint) == -1) {
            next('Member ' + key.fingerprint + ' has to lose his member status. Wrong block.');
            return;
          }
        });
        next();
      },
    ], done);
  }

  function checkCommunityChanges (block, done) {
    var mss = block.getMemberships().mss;
    async.waterfall([
      function (next){
        _(mss).values().forEach(function(ms){
          var change = ms.membership == 'IN' ? '+' : '-';
          var fingerprint = ms.fingerprint;
          if (block.membersChanges.indexOf(change + fingerprint) == -1) {
            next('Wrong members changes');
            return;
          }
        });
        next();
      },
    ], done);
  }

  function checkCertificationsUpdates (block, done) {
    // Only *members* signatures can be here (not newcomers, nor leaving members)
    if (block.number == 0) {
      done();
      return;
    }
    var certifications = block.getTierCertificationPackets();
    async.forEach(certifications, function(cert, callback){
      Key.isStayingMember(cert.issuerKeyId.toHex().toUpperCase(), function (err, willBeMember) {
        if (!willBeMember || err)
          callback(err || 'Signatory is not a member');
        else
          callback();
      });
    }, done);
  }

  function updateMembers (block, done) {
    var mss = block.getMemberships().mss;
    async.forEach(_(mss).values(), function(ms, callback){
      var doMember = ms.membership == 'IN' ? Key.addMember : Key.removeMember;
      async.waterfall([
        function (next){
          doMember.call(Key, ms.fingerprint, next);
        },
        function (next) {
          Key.removeKicked(ms.fingerprint, next);
        }
      ], callback);
    }, done);
  }

  function saveBlockData (block, done) {
    async.waterfall([
      function (next) {
        // Saves the block
        block.save(function (err) {
          next(err);
        });
      },
      function (next) {
        // Update members
        updateMembers(block, next);
      },
      function (next){
        // Save new pubkeys
        var pubkeys = block.getBasicPublicKeys();
        async.forEach(pubkeys, function(key, callback){
          var armored = unix2dos(key.armor());
          var parser = parsers.parsePubkey(next);
          async.waterfall([
            function (next){
              parser.asyncWrite(armored, next);
            },
            function (json, next) {
              json.keychain = base64.encode(key.toPacketlist().write());
              PublicKeyService.submitPubkey(json, function (err) {
                next(err);
              });
            },
          ], callback);
        }, next);
      },
      function (next){
        // Save key updates
        next();
      },
      function (next){
        // Save links
        var certifs = block.getTierCertificationPackets();
        async.forEach(certifs, function(certif, callback){
          async.waterfall([
            function (next){
              PublicKey.getTheOne(certif.issuerKeyId.toHex().toUpperCase(), next);
            },
            function (pubk, next){
              var link = new Link({
                source: pubk.fingerprint,
                target: certif.target,
                timestamp: certif.created.timestamp()
              });
              link.save(function (err) {
                next(err);
              });
            },
          ], callback);
        }, next);
      },
      function (next){
        // Save memberships
        var mss = block.getMemberships().mss;
        async.forEach(mss, function(ms, callback){
          KeychainService.submit(ms, callback);
        }, next);
      },
      function (next){
        // Compute obsolete links
        computeObsoleteLinks(block, next);
      },
    ], function (err) {
      done(err, block);
    });
  }

  function computeObsoleteLinks (block, done) {
    async.waterfall([
      function (next){
        Link.obsoletes(block.timestamp - MAX_LINK_VALIDITY, next);
      },
      function (next){
        Key.getMembers(next);
      },
      function (members, next){
        // If a member is over 3 steps from the whole WoT, has to be kicked
        async.forEach(members, function(key, callback){
          var fpr = key.fingerprint;
          async.waterfall([
            function (next){
              Link.isOver3StepsOfAMember(key, members, next);
            },
            function (nbOutdistanced, next){
              if (nbOutdistanced) {
                Key.setKicked(fpr, next);
              }
              else next();
            },
          ], callback);
        }, next);
      },
    ], done);
  }

  function WOTPubkey (fingerprint, rawPackets) {

    this.packets = new openpgp.packet.List();

    var that = this;

    // Get signatories' certification packet of the userid (not checked yet)
    this.addAll = function (packets) {
      var thePackets = new openpgp.packet.List();
      var base64decoded = base64.decode(packets);
      thePackets.read(base64decoded);
      thePackets = thePackets.filterByTag(
        openpgp.enums.packet.publicKey,
        openpgp.enums.packet.publicSubkey,
        openpgp.enums.packet.userid,
        openpgp.enums.packet.signature);
      thePackets.forEach(function(p){
        if (p.tag == openpgp.enums.packet.signature) {
          var signaturesToKeep = [
            openpgp.enums.signature.cert_generic,
            openpgp.enums.signature.cert_persona,
            openpgp.enums.signature.cert_casual,
            openpgp.enums.signature.cert_positive,
            openpgp.enums.signature.subkey_binding
          ];
          if (~signaturesToKeep.indexOf(p.signatureType))
            that.packets.push(p);
        }
        else that.packets.push(p);
      });
    }

    this.addAll(rawPackets);

    // Get signatories' certification packet of the userid (not checked yet)
    this.getSignatories = function () {
      var signatories = [];
      this.packets.filterByTag(openpgp.enums.packet.signature).forEach(function(packet){
        var issuerKeyId = packet.issuerKeyId.toHex().toUpperCase();
        var isSelfSig = fingerprint.match(new RegExp(issuerKeyId + '$'));
        if (!isSelfSig) {
          signatories.push({
            keyID: issuerKeyId,
            packet: packet
          });
        }
      });
      return signatories;
    };

    // Get signatories' certification packet of the userid (not checked yet)
    this.hasOnlyOneValidUserID = function () {
      return this.getPubKey().getPrimaryUser() != null && this.getUserIDs().length == 1;
    };

    // Get signatories' certification packet of the userid (not checked yet)
    this.getSelfCertifications = function () {
      var certifs = [];
      this.packets.filterByTag(openpgp.enums.packet.signature).forEach(function(packet){
        var signaturesToKeep = [
          openpgp.enums.signature.cert_generic,
          openpgp.enums.signature.cert_persona,
          openpgp.enums.signature.cert_casual,
          openpgp.enums.signature.cert_positive
        ];
        if (~signaturesToKeep.indexOf(packet.signatureType)) {
          var issuerKeyId = packet.issuerKeyId.toHex().toUpperCase();
          var isSelfSig = fingerprint.match(new RegExp(issuerKeyId + '$'));
          if (isSelfSig) {
            certifs.push({
              keyID: issuerKeyId,
              packet: packet
            });
          }
        }
      });
      return certifs;
    };

    this.getPurePubkey = function () {
      return new openpgp.key.Key(this.getPurePackets());
    };

    // Get signatories' certification packet of the userid (not checked yet)
    this.getPurePackets = function () {
      var purePackets = [];
      var packets = this.packets.filterByTag(
        openpgp.enums.packet.publicKey,
        openpgp.enums.packet.publicSubkey,
        openpgp.enums.packet.userid,
        openpgp.enums.packet.signature);
      packets.forEach(function(packet){
        var signaturesToKeep = [
          openpgp.enums.signature.cert_generic,
          openpgp.enums.signature.cert_persona,
          openpgp.enums.signature.cert_casual,
          openpgp.enums.signature.cert_positive,
          openpgp.enums.signature.subkey_binding
        ];
        if (~signaturesToKeep.indexOf(packet.signatureType)) {
          var issuerKeyId = packet.issuerKeyId.toHex().toUpperCase();
          var isSelfSig = fingerprint.match(new RegExp(issuerKeyId + '$'));
          if (isSelfSig) {
            purePackets.push(packet);
          }
        }
      });
      return purePackets;
    };

    this.getPubKey = function () {
      return new openpgp.key.Key(this.packets);
    };

    this.getUserIDs = function () {
      var pk = this.getPubKey();
      return pk.getUserIds();
    }

    this.armor = function () {
      var armor = new openpgp.key.Key(this.packets).armor();
      return armor;
    }
  }

  this.current = function (done) {
    KeyBlock.current(function (err, kb) {
      done(err, kb || null);
    })
  }

  this.generateRoot = function (uids, done) {
    var joinData = {};
    var fingerprints = [];
    async.forEach(uids, function(uid, callback){
      var join = { pubkey: null, ms: null };
      async.waterfall([
        function (next){
          Membership.find({ userid: uid, eligible: true }, next);
        },
        function (mss, next){
          if (mss.length == 0) {
            next('Membership of ' + uid + ' not found');
            return;
          }
          else if (mss.length > 1) {
            next('Multiple memberships for same user found! Stopping.')
            return;
          }
          else {
            join.ms = mss[0];
            fingerprints.push(join.ms.issuer);
            PublicKey.getTheOne(join.ms.issuer, next);
          }
        },
        function (pubk, next){
          join.pubkey = pubk;
          if (!pubk.keychain && pubk.eligible.length > 0) {
            // Not in the keychain, with eligible packets, potential new member
            var wrappedKey = keyhelper.fromArmored(pubk.raw);
            // Just require a good udid2
            if (!wrappedKey.hasValidUdid2()) {
              next('User ' + uid + ' does not have a valid udid2');
              return;
            }
            joinData[join.pubkey.fingerprint] = join;
            next();
          }
          else next('Already in the keychain, or no eligible packet');
        },
      ], callback);
    }, function(err){
      var block = new KeyBlock();
      block.version = 1;
      block.currency = joinData[fingerprints[0]].ms.currency;
      block.number = 0;
      // Members merkle
      fingerprints.sort();
      var tree = merkle(fingerprints, 'sha1').process();
      block.membersCount = fingerprints.length;
      block.membersRoot = tree.root();
      block.membersChanges = [];
      fingerprints.forEach(function(fpr){
        block.membersChanges.push('+' + fpr);
      });
      // Public keys
      block.publicKeys = [];
      _(joinData).values().forEach(function(join){
        var pkData = {
          fingerprint: join.pubkey.fingerprint,
          packets: base64.encode(join.pubkey.getWritablePacketsWithoutOtherCertifications().write())
        };
        block.publicKeys.push(pkData);
      });
      // Memberships
      block.memberships = [];
      _(joinData).values().forEach(function(join){
        var ms = join.ms;
        var shortMS = [1, join.pubkey.fingerprint, 'IN', ms.date.timestamp(), ms.userid].join(':');
        block.memberships.push(shortMS);
      });
      // Memberships signatures
      block.membershipsSigs = [];
      _(joinData).values().forEach(function(join){
        var ms = join.ms;
        var splits = dos2unix(ms.signature).split('\n');
        var signature = "";
        var keep = false;
        splits.forEach(function(line){
          if (keep && !line.match('-----END PGP') && line != '') signature += line + '\n';
          if (line == "") keep = true;
        });
        block.membershipsSigs.push({
          fingerprint: join.pubkey.fingerprint,
          packets: signature
        });
      });
      done(null, block);
    });
  };

  this.prove = function (block, sigFunc, nbZeros, done) {
    var powRegexp = new RegExp('^0{' + nbZeros + '}');
    var pow = "", sig = "", raw = "";
    var start = new Date().timestamp();
    var testsCount = 0;
    logger.debug('Generating proof-of-work...');
    async.whilst(
      function(){ return !pow.match(powRegexp); },
      function (next) {
        var newTS = new Date().timestamp();
        if (newTS == block.timestamp) {
          block.nonce++;
        } else {
          block.nonce = 0;
          block.timestamp = newTS;
        }
        raw = block.getRaw();
        sigFunc(raw, function (err, sigResult) {
          sig = unix2dos(sigResult);
          var full = raw + sig;
          pow = full.hash();
          testsCount++;
          if (testsCount % 100 == 0) process.stdout.write('.');
          next();
        });
      }, function (err) {
        block.signature = sig;
        var end = new Date().timestamp();
        var duration = moment.duration((end - start)) + 's';
        var testsPerSecond = (testsCount / (end - start)).toFixed(2);
        logger.debug('Done: ' + pow + ' in ' + duration + ' (~' + testsPerSecond + ' tests/s)');
        done(err, block);
      });
  };
}
