var mongoose  = require('mongoose');
var async     = require('async');
var sha1      = require('sha1');
var _         = require('underscore');
var fs        = require('fs');
var Schema    = mongoose.Schema;
var base64    = require('../lib/base64');
var openpgp   = require('openpgp');
var keyhelper = require('../lib/keyhelper');
var logger    = require('../lib/logger')('dao keyblock');

var KeyBlockSchema = new Schema({
  version: String,
  currency: String,
  nonce: {"type": Number, "default": 0},
  number: {"type": Number, "default": 0},
  timestamp: {"type": Number, "default": 0},
  previousHash: String,
  previousIssuer: String,
  membersCount: {"type": Number, "default": 0},
  membersRoot: String,
  membersChanges: Array,
  keysChanges: Array,
  signature: String,
  hash: String,
  issuer: String,
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

KeyBlockSchema.pre('save', function (next) {
  this.updated = Date.now();
  next();
});

KeyBlockSchema.methods = {
  
  json: function() {
    var that = this;
    var json = { raw: this.getRaw() };
    [
      "version",
      "nonce",
      "number",
      "timestamp",
      "membersCount",
    ].forEach(function(field){
      json[field] = parseInt(that[field], 10);
    });
    [
      "currency",
      "membersRoot",
      "signature",
      "hash",
    ].forEach(function(field){
      json[field] = that[field] || "";
    });
    [
      "previousHash",
      "previousIssuer",
    ].forEach(function(field){
      json[field] = that[field] || null;
    });
    [
      "membersChanges",
      "publicKeys",
      "memberships",
      "membershipsSigs",
    ].forEach(function(field){
      json[field] = that[field] || [];
    });
    return json;
  },

  getNewPubkeys: function() {
    var pubkeys = [];
    this.keysChanges.forEach(function(kc){
      if (kc.type == 'F' || kc.type == 'N') {
        pubkeys.push(kc.keypackets);
      }
    });
    return pubkeys;
  },

  getKeyUpdates: function() {
    var updates = {};
    this.keysChanges.forEach(function(kc){
      updates[kc.fingerprint] = { certifs: '', subkeys: '' };
      var list = new openpgp.packet.List();
      if (kc.type == 'U' || kc.type == 'B') {
        // Subkeys
        if (kc.keypackets) {
          list.concat(keyhelper.toPacketlist(kc.keypackets));
          updates[kc.fingerprint].subkeys = keyhelper.toEncoded(list);
        }
        // Certifs
        if (kc.certpackets) {
          list.concat(keyhelper.toPacketlist(kc.certpackets));
          updates[kc.fingerprint].certifs = keyhelper.toEncoded(list);
        }
      }
    });
    return updates;
  },

  getPublicKeysPackets: function() {
    var pubkeys = [];
    this.publicKeys.forEach(function(obj){
      var packets = new openpgp.packet.List();
      var base64decoded = base64.decode(obj.packets);
      packets.read(base64decoded);
      packets = packets.filterByTag(openpgp.enums.packet.publicKey);
      if (packets.length == 1) {
        pubkeys.push(packets[0]);
      }
    });
    return pubkeys;
  },

  getMemberships: function() {
    var notFoundMembership = 0;
    var mss = {};
    this.keysChanges.forEach(function(kc){
      if (kc.membership) {
        var shortSIG = kc.membership.signature;
        var shortMS = kc.membership.membership;
        // Membership content
        var sp = shortMS.split(':');
        // Signature
        var signature = '-----BEGIN PGP SIGNATURE-----\nVersion: GnuPG v1\n\n';
        signature += shortSIG;
        signature += '-----END PGP SIGNATURE-----\n';
        var ms = {
          issuer: kc.fingerprint,
          version: sp[0],
          keyID: sp[1].substring(24),
          fingerprint: sp[1],
          membership: sp[2],
          date: new Date(parseInt(sp[3])*1000),
          userid: sp[4],
          signature: signature
        };
        mss[ms.keyID] = ms;
      }
    });
    return {
      'notFoundMembership': notFoundMembership,
      'mss': mss
    };
  },

  getNewMembers: function() {
    var members = [];
    for (var i = 0; i < this.membersChanges.length; i++) {
      var matches = this.membersChanges[i].match(/^\+([\w\d]{40})$/);
      if(matches){
        members.push(matches[1]);
      }
    }
    return members;
  },

  getLeavingMembers: function() {
    var members = [];
    for (var i = 0; i < this.membersChanges.length; i++) {
      var matches = this.membersChanges[i].match(/^\-([\w\d]{40})$/);
      if(matches){
        members.push(matches[1]);
      }
    }
    return members;
  },

  getHash: function() {
    if (!this.hash) {
      this.hash = sha1(this.getRaw()).toUpperCase();
    }
    return this.hash;
  },

  getRaw: function() {
    return require('../lib/rawer').getKeyblockWithoutSignature(this);
  },

  getRawSigned: function() {
    return require('../lib/rawer').getKeyblock(this);
  },

  getPrevious: function (done) {
    if(this.number == 0){
      done();
      return;
    }
    this.model('KeyBlock').find({ number: this.number - 1, hash: this.previousHash }, function (err, ams) {
      if(ams.length == 0){
        done('Previous keyblock not found');
        return;
      }
      if(ams.length > 1){
        done('Multiple previous keyblocks matches');
        return;
      }
      done(null, ams[0]);
    });
  },

  display: function (done) {
    console.log('------------------');
    console.log('Block#%s', this.number);
    console.log('Changes:');
    this.keysChanges.forEach(function(kc){
      console.log('>>> %s %s', kc.type, kc.fingerprint);
      var certifs = keyhelper.toPacketlist(kc.certpackets);
      certifs.forEach(function(certif){
        console.log('>>> certified by 0x%s', certif.issuerKeyId.toHex().toUpperCase());
      });
    });
    done();
  }
};

KeyBlockSchema.statics.nextNumber = function (done) {
  this.current(function (err, kb) {
    var number = err ? -1 : kb.number;
    done(null, number + 1);
  });
};

KeyBlockSchema.statics.current = function (done) {

  this.find({}).sort({ number: -1 }).limit(1).exec(function (err, blocks) {
    if(blocks && blocks.length == 1){
      done(err, blocks[0]);
      return;
    }
    else {
      done('No current keyblock');
      return;
    }
  });
};

KeyBlockSchema.statics.findByNumberAndHash = function (number, hash, done) {

  this.find({ number: number, hash: hash }, function (err, blocks) {
    if(blocks && blocks.length == 1){
      done(err, blocks[0]);
      return;
    }
    if(!blocks || blocks.length == 0){
      done('No keyblock found');
      return;
    }
    if(blocks || blocks.length > 1){
      done('More than one keyblock found');
    }
  });
};

KeyBlockSchema.statics.findByNumber = function (number, done) {

  this.find({ number: number, promoted: true }, function (err, blocks) {
    if(blocks && blocks.length == 1){
      done(err, blocks[0]);
      return;
    }
    if(!blocks || blocks.length == 0){
      done('No keyblock found');
      return;
    }
    if(blocks || blocks.length > 1){
      done('More than one keyblock found');
    }
  });
};

KeyBlockSchema.statics.getLastStatusOfMember = function (member, kbNumberLimit, done) {

  var that = this;
  var criterias = { number: { $lte: kbNumberLimit }, membersChanges: new RegExp("^(\\+|-)" + member + "$")};
  async.waterfall([
    function (next){
      that
        .find(criterias)
        .sort({ 'number': -1 })
        .limit(1)
        .exec(function (err, ams) {
          next(err, ams);
        });
    },
    function (ams, next){
      if (ams.length == 1) {
        if (~ams[0].membersChanges.indexOf("+" + member)) {
          // Last time, member was joining
          next(null, 1);
        } else {
          // Last time, member was leaving
          next(null, -1);
        }
      } else {
        // Member has never been seen
        next(null, 0);
      }
    },
  ], done);
};

KeyBlockSchema.statics.isMember = function (member, kbNumber, done) {

  var that = this;
  async.waterfall([
    function (next){
      that.getLastStatusOfMember(member, kbNumber, next);
    },
    function (status, next){
      next(null, status > 0);
    },
  ], done);
};

KeyBlockSchema.statics.isMemberForKB = function (member, kbNumber, kbHash, done) {

  this.searchPresence(member, kbNumber, kbHash, checkIsJoiningMember, checkIsLeavingMember, this.searchPresence.bind(this), done);
};

KeyBlockSchema.statics.searchPresence = function (member, kbNumber, kbHash, isJoining, isLeaving, searchCallBack, done) {
  var that = this;
  async.waterfall([
    function(next){
      that.findByNumberAndHash(kbNumber, kbHash, next);
    },
    function (kb, next) {
      if (isJoining(kb, member)) {
        // Is a member
        next(null, true);
      } else if (isLeaving(kb, member)) {
        // Not a member
        next(null, false);
      } else if (kb.number > 0) {
        // Not present in this keyblock, check previous
        logger.debug("searchPresence callback %s to %s", kb.number, kb.number -1);
        searchCallBack(member, kb.number - 1, kb.previousHash, isJoining, isLeaving, searchCallBack, next);
      } else {
        // No occurrence found
        next(null, false);
      }
    }
  ], done);
};

function checkIsJoiningMember (am, key) { return ~am.membersChanges.indexOf('+' + key); }
function checkIsLeavingMember (am, key) { return ~am.membersChanges.indexOf('-' + key); }

module.exports = KeyBlockSchema;
