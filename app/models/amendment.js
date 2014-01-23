var mongoose = require('mongoose');
var async    = require('async');
var sha1     = require('sha1');
var _        = require('underscore');
var fs       = require('fs');
var hdc      = require('../../node_modules/hdc');
var Schema   = mongoose.Schema;

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
  
  json: function() {
    var that = this;
    var json = { raw: this.getRaw() };
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
      "membersChanges"
    ].forEach(function(field){
      json[field] = that[field];
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

  updateMerkles: function (done) {
    var that = this;
    var Merkle = mongoose.model('Merkle');
    function build (func, funcAM, callback) {
      async.waterfall([
        function (next) {
          // Computes leaves
          funcAM.call(that, next);
        },
        function (leaves, next){
          // Points to good Merkle and overwrite it
          func.call(Merkle, that.number, that.hash, function (err, merkle) {
            merkle.initialize(leaves);
            next(err, merkle);
          });
        },
        function (merkle, next) {
          merkle.save(next);
        }
      ], callback);
    }
    async.parallel({
      membersMerkle: function(callback){
        build(Merkle.membersWrittenForAmendment, that.buildMembersMerkle, callback);
      },
      votersMerkle: function(callback){
        build(Merkle.votersWrittenForAmendment, that.buildVotersMerkle, callback);
      }
    }, done);
  },

  /**
  * Build Merkle of members for this amendment, according
  * to previous amendment members Merkle and applying MembersChanges field.
  *
  * Result API: hdc/amendments/view/[AMENDMENT_ID]/members
  */
  buildMembersMerkle: function (done) {
    var that = this;
    this.getPrevious(function (err, previous) {
      if(err){
        done(err);
        return;
      }
      async.waterfall([
        function (next){
          if(!previous){
            next(null, []);
            return;
          }
          // Get members Merkle of previous amendment
          mongoose.model('Merkle').membersWrittenForAmendment(previous.number, previous.hash, function (err, merkle) {
            next(err, merkle.leaves());
          });
        },
        function (leaves, next) {
          // Apply MembersChanges field
          leaves = _(leaves).union(that.getNewMembers());
          leaves = _(leaves).difference(that.getLeavingMembers());
          next(null, leaves);
        }
      ], function (err, leaves) {
        if(leaves) leaves.sort();
        done(err, leaves);
      });
    })
  },

  /**
  * Build Merkle of voters for this amendment, according
  * to previous amendment voters Merkle and applying VotersChanges field.
  *
  * Result API: hdc/amendments/view/[AMENDMENT_ID]/voters
  */
  buildVotersMerkle: function (done) {
    var that = this;
    this.getPrevious(function (err, previous) {
      if(err){
        done(err);
        return;
      }
      async.waterfall([
        function (next){
          if(!previous){
            next(null, []);
            return;
          }
          // Get voters Merkle of previous amendment
          mongoose.model('Merkle').votersWrittenForAmendment(previous.number, previous.hash, function (err, merkle) {
            next(err, merkle.leaves());
          });
        },
        function (leaves, next) {
          // Apply VotersChanges field
          leaves = _(leaves).union(that.getNewVoters());
          leaves = _(leaves).difference(that.getLeavingVoters());
          next(null, leaves);
        }
      ], function (err, leaves) {
        if(leaves) leaves.sort();
        done(err, leaves);
      });
    })
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
      done(null, amends.length == 1 ? amends[0] : null);
  });
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
