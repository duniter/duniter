var mongoose = require('mongoose');
var async    = require('async');
var sha1     = require('sha1');
var _        = require('underscore');
var fs       = require('fs');
var hdc      = require('../../node_modules/hdc');
var Schema   = mongoose.Schema;
var log4js   = require('log4js');
var logger   = log4js.getLogger('dao amendment');

var AmendmentSchema = new Schema({
  version: String,
  currency: String,
  number: {"type": Number, "default": 0},
  generated: {"type": Number, "default": 0},
  dividend: Number,
  coinMinPower: Number,
  nextVotes: {"type": Number, "default": 0},
  previousHash: String,
  votersRoot: String,
  votersCount: {"type": Number, "default": 0},
  votersChanges: Array,
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
  
  hdc: function() {
    var am = new hdc.Amendment(this.getRaw());
    fill(am, this);
    return am;
  },

  copyTo: function (amTarget) {
    var that = this;
    [
      "version",
      "currency",
      "number",
      "generated",
      "dividend",
      "coinMinPower",
      "nextVotes",
      "previousHash",
      "votersRoot",
      "votersCount",
      "votersChanges",
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
      "nextVotes",
      "dividend",
      "coinMinPower",
      "votersCount",
      "membersCount",
    ].forEach(function(field){
      json[field] = parseInt(that[field], 10);
    });
    [
      "currency",
      "votersRoot",
      "membersRoot",
    ].forEach(function(field){
      json[field] = that[field] || "";
    });
    [
      "previousHash",
    ].forEach(function(field){
      json[field] = that[field] || null;
    });
    [
      "votersChanges",
      "membersChanges"
    ].forEach(function(field){
      json[field] = that[field] || [];
    });
    return json;
  },
  
  parse: function(rawAmend, callback) {
    var am = new hdc.Amendment(rawAmend);
    if(!am.error){
      fill(this, am);
    }
    callback(am.error);
  },

  verify: function(currency, done){
    var am = new hdc.Amendment(this.getRaw());
    am.verify(currency);
    done(am.error, am.errorCode);
  },

  getNewMembers: function() {
    return this.hdc().getNewMembers();
  },

  getNewVoters: function() {
    return this.hdc().getNewVoters();
  },

  getLeavingMembers: function() {
    return this.hdc().getLeavingMembers();
  },

  getLeavingVoters: function() {
    return this.hdc().getLeavingVoters();
  },

  getRaw: function() {
    var raw = "";
    raw += "Version: " + this.version + "\n";
    raw += "Currency: " + this.currency + "\n";
    raw += "Number: " + this.number + "\n";
    raw += "GeneratedOn: " + this.generated + "\n";
    if(this.dividend){
      raw += "UniversalDividend: " + this.dividend + "\n";
    }
    if(this.coinMinPower != undefined && this.coinMinPower != null){
      raw += "CoinMinimalPower: " + this.coinMinPower + "\n";
    }
    raw += "NextRequiredVotes: " + this.nextVotes + "\n";
    if(this.previousHash){
      raw += "PreviousHash: " + this.previousHash + "\n";
    }
    raw += "MembersRoot: " + this.membersRoot + "\n";
    raw += "MembersCount: " + this.membersCount + "\n";
    raw += "MembersChanges:\n";
    for(var i = 0; i < this.membersChanges.length; i++){
      raw += this.membersChanges[i] + "\n";
    }
    raw += "VotersRoot: " + this.votersRoot + "\n";
    raw += "VotersCount: " + this.votersCount + "\n";
    raw += "VotersChanges:\n";
    for(var j = 0; j < this.votersChanges.length; j++){
      raw += this.votersChanges[j] + "\n";
    }
    return raw.unix2dos();
  },

  getPrevious: function (done) {
    if(this.number == 0){
      done();
      return;
    }
    Amendment.find({ number: this.number - 1, hash: this.previousHash }, function (err, ams) {
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
  },

  loadFromFile: function(file, done) {
    var obj = this;
    async.waterfall([
      function (next){
        fs.readFile(file, {encoding: "utf8"}, next);
      },
      function (data, next){
        obj.parse(data, next);
      },
    ], done);
  }
};

AmendmentSchema.statics.nextNumber = function (done) {
  Amendment.current(function (err, am) {
    var number = err ? -1 : am.number;
    done(null, number + 1);
  });
};

AmendmentSchema.statics.current = function (done) {

  this.find({ promoted: true }, function (err, amends) {
    if(amends && amends.length == 1){
      done(err, amends[0]);
      return;
    }
    if(!amends || amends.length == 0){
      done('No current amendment');
      return;
    }
    if(amends || amends.length > 1){
      var current = undefined;
      amends.forEach(function (am) {
        if(!current || (current && current.number < am.number))
          current = am;
      });
      done(err, current);
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

AmendmentSchema.statics.findClosestPreviousWithMinimalCoinPower = function (sigDate, done) {

  var sigDateToTimestamp = parseInt(sigDate.getTime()/1000, 10);
  this
    .find({ coinMinPower: { $gte: 0 }, promoted: true, generated: { $lte: sigDateToTimestamp } })
    .sort({ 'number': -1 })
    .limit(1)
    .exec(function (err, amends) {
      done(err, (amends && amends.length == 1) ? amends[0] : null);
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

AmendmentSchema.statics.getTheOneToBeVoted = function (number, done) {

  this.find({ number: number, selfGenerated: true }, function (err, amends) {
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

AmendmentSchema.statics.getLastStatusOfVoter = function (voter, amNumberLimit, proposedToo, done) {

  if (arguments.length == 3) {
    done = proposedToo;
    proposedToo = undefined;
  }

  var criterias = { number: { $lte: amNumberLimit }, votersChanges: new RegExp("^(\\+|-)" + voter + "$")};
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
        .exec(next);
    },
    function (ams, next){
      if (ams.length == 1) {
        if (~ams[0].votersChanges.indexOf("+" + voter)) {
          // Last time, voter was joining
          next(null, 1);
        } else {
          // Last time, voter was leaving
          next(null, -1);
        }
      } else {
        // Voter has never been seen
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

AmendmentSchema.statics.isVoter = function (voter, amNumber, done) {
  var that = this;
  async.waterfall([
    function (next){
      that.getLastStatusOfVoter(voter, amNumber, next);
    },
    function (status, next){
      logger.debug('isVoter ? %s for AM#%s = %s', voter, amNumber, status);
      next(null, status > 0);
    },
  ], done);
};

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

AmendmentSchema.statics.isProposedVoter = function (voter, amNumber, done) {

  var that = this;
  async.waterfall([
    function (next){
      that.getLastStatusOfVoter(voter, amNumber, true, next);
    },
    function (status, next){
      next(null, status > 0);
    },
  ], done);
};

var Amendment = mongoose.model('Amendment', AmendmentSchema);

function fill (am1, am2) {
  [
    "version",
    "currency",
    "number",
    "generated",
    "nextVotes",
    "dividend",
    "coinMinPower",
    "previousHash",
    "votersRoot",
    "votersCount",
    "votersChanges",
    "membersRoot",
    "membersCount",
    "membersChanges",
    "hash"
  ].forEach(function(field){
    am1[field] = am2[field];
  });
}
