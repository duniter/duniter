var mongoose = require('mongoose');
var async    = require('async');
var sha1     = require('sha1');
var _        = require('underscore');
var fs       = require('fs');
var Schema   = mongoose.Schema;
var logger   = require('../lib/logger')('dao keyblock');

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
  publicKeys: Array,
  memberships: Array,
  membershipsSigs: Array,
  signature: String,
  hash: String,
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
