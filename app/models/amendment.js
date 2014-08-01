var mongoose = require('mongoose');
var async    = require('async');
var sha1     = require('sha1');
var _        = require('underscore');
var fs       = require('fs');
var Schema   = mongoose.Schema;
var logger   = require('../lib/logger')('dao amendment');

var AmendmentSchema = new Schema({
  version: String,
  currency: String,
  number: {"type": Number, "default": 0},
  generated: {"type": Number, "default": 0},
  algo: String,
  dividend: Number,
  coinAlgo: String,
  coinBase: Number,
  coinList: [Number],
  previousHash: String,
  membersRoot: String,
  membersCount: {"type": Number, "default": 0},
  membersChanges: Array,
  promoted: {"type": Boolean, "default": false},
  monetaryMass: {"type": Number, "default": 0},
  selfGenerated: {"type": Boolean, "default": false},
  hash: String,
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

AmendmentSchema.pre('save', function (next) {
  this.updated = Date.now();
  next();
});

AmendmentSchema.methods = {

  copyTo: function (amTarget) {
    var that = this;
    [
      "version",
      "currency",
      "number",
      "generated",
      "algo",
      "dividend",
      "coinAlgo",
      "coinBase",
      "coinList",
      "previousHash",
      "membersRoot",
      "membersCount",
      "membersChanges",
      "promoted",
      "monetaryMass",
      "selfGenerated",
      "hash",
      "created",
      "updated"
      ].forEach(function (prop) {
        amTarget[prop] = that[prop];
      });
      return amTarget;
  },
  
  json: function() {
    var that = this;
    var json = { raw: this.getRaw() };
    [
      "version",
      "number",
      "generated",
      "dividend",
      "coinBase",
      "membersCount",
    ].forEach(function(field){
      json[field] = parseInt(that[field], 10);
    });
    [
      "currency",
      "membersRoot",
      "coinAlgo",
    ].forEach(function(field){
      json[field] = that[field] || "";
    });
    [
      "previousHash",
    ].forEach(function(field){
      json[field] = that[field] || null;
    });
    [
      "coinList",
      "membersChanges"
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
    return require('../lib/rawer').getAmendment(this);
  },

  getPrevious: function (done) {
    if(this.number == 0){
      done();
      return;
    }
    this.model('Amendment').find({ number: this.number - 1, hash: this.previousHash }, function (err, ams) {
      if(ams.length == 0){
        done('Previous amendment not found');
        return;
      }
      if(ams.length > 1){
        done('Multiple previous amendments matches');
        return;
      }
      done(null, ams[0]);
    });
  }
};

AmendmentSchema.statics.nextNumber = function (done) {
  this.current(function (err, am) {
    var number = err ? -1 : am.number;
    done(null, number + 1);
  });
};

AmendmentSchema.statics.current = function (done) {

  this.find({ promoted: true }).sort({ number: -1 }).limit(1).exec(function (err, amends) {
    if(amends && amends.length == 1){
      done(err, amends[0]);
      return;
    }
    else {
      done('No current amendment');
      return;
    }
  });
};

AmendmentSchema.statics.findByNumberAndHash = function (number, hash, done) {

  this.find({ number: number, hash: hash }, function (err, amends) {
    if(amends && amends.length == 1){
      done(err, amends[0]);
      return;
    }
    if(!amends || amends.length == 0){
      done('No amendment found');
      return;
    }
    if(amends || amends.length > 1){
      done('More than one amendment found');
    }
  });
};

AmendmentSchema.statics.findPromotedByNumber = function (number, done) {

  this.find({ number: number, promoted: true }, function (err, amends) {
    if(amends && amends.length == 1){
      done(err, amends[0]);
      return;
    }
    if(!amends || amends.length == 0){
      done('No amendment found');
      return;
    }
    if(amends || amends.length > 1){
      done('More than one amendment found');
    }
  });
};

AmendmentSchema.statics.findPromotedPreceding = function (timpestamp, done) {

  this
    .find({ generated: { $lte: timpestamp }, promoted: true })
    .sort({ 'number': -1 })
    .limit(1)
    .exec(function (err, amends) {
      done(err, (amends && amends.length == 1) ? amends[0] : null);
  });
};

AmendmentSchema.statics.getPreviouslyPromotedWithDividend = function (done) {

  this
    .find({ promoted: true, dividend: { $gt: 0 } })
    .sort({ 'number': -1 })
    .limit(1)
    .exec(function (err, amends) {
      done(err, (amends && amends.length == 1) ? amends[0] : null);
  });
};

AmendmentSchema.statics.getTheOneToBeVoted = function (number, algo, done) {

  this.find({ number: number, algo: algo, selfGenerated: true }, function (err, amends) {
    if(amends && amends.length == 1){
      done(err, amends[0]);
      return;
    }
    if(!amends || amends.length == 0){
      done('No amendment found');
      return;
    }
    if(amends || amends.length > 1){
      done('More than one amendment found');
    }
  });
};

AmendmentSchema.statics.getLastStatusOfMember = function (member, amNumberLimit, proposedToo, done) {

  if (arguments.length == 3) {
    done = proposedToo;
    proposedToo = undefined;
  }

  var criterias = { number: { $lte: amNumberLimit }, membersChanges: new RegExp("^(\\+|-)" + member + "$")};
  if (proposedToo) {
    criterias.$or = [{ promoted: true }, { selfGenerated: true }];
  } else {
    criterias.promoted = true;
  }

  var that = this;
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

AmendmentSchema.statics.isMember = function (member, amNumber, done) {

  var that = this;
  async.waterfall([
    function (next){
      that.getLastStatusOfMember(member, amNumber, next);
    },
    function (status, next){
      next(null, status > 0);
    },
  ], done);
};

AmendmentSchema.statics.isMemberForAM = function (member, amNumber, amHash, done) {

  this.searchPresence(member, amNumber, amHash, checkIsJoiningMember, checkIsLeavingMember, this.searchPresence.bind(this), done);
};

AmendmentSchema.statics.searchPresence = function (member, amNumber, amHash, isJoining, isLeaving, searchCallBack, done) {
  var that = this;
  async.waterfall([
    function(next){
      that.findByNumberAndHash(amNumber, amHash, next);
    },
    function (am, next) {
      if (isJoining(am, member)) {
        // Is a member
        next(null, true);
      } else if (isLeaving(am, member)) {
        // Not a member
        next(null, false);
      } else if (am.number > 0) {
        // Not present in this amendment, check previous
        logger.debug("searchPresence callback %s to %s", am.number, am.number -1);
        searchCallBack(member, am.number - 1, am.previousHash, isJoining, isLeaving, searchCallBack, next);
      } else {
        // No occurrence found
        next(null, false);
      }
    }
  ], done);
};

function checkIsJoiningMember (am, key) { return ~am.membersChanges.indexOf('+' + key); }
function checkIsLeavingMember (am, key) { return ~am.membersChanges.indexOf('-' + key); }

AmendmentSchema.statics.isProposedMember = function (member, amNumber, done) {

  var that = this;
  async.waterfall([
    function (next){
      that.getLastStatusOfMember(member, amNumber, true, next);
    },
    function (status, next){
      next(null, status > 0);
    },
  ], done);
};

module.exports = AmendmentSchema;

function fill (am1, am2) {
  [
    "version",
    "currency",
    "number",
    "generated",
    "dividend",
    "coinAlgo",
    "coinBase",
    "coinList",
    "previousHash",
    "membersRoot",
    "membersCount",
    "membersChanges",
    "hash"
  ].forEach(function(field){
    am1[field] = am2[field];
  });
}
