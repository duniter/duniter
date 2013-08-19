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
  previousHash: String,
  dividend: Number,
  coinMinPower: Number,
  votersSigRoot: String,
  votersRoot: String,
  votersCount: {"type": Number, "default": 0},
  votersChanges: Array,
  membersStatusRoot: String,
  membersRoot: String,
  membersCount: {"type": Number, "default": 0},
  membersChanges: Array,
  promoted: {"type": Boolean, "default": false},
  hash: String,
  created: Date,
  updated: Date
});

AmendmentSchema.methods = {
  
  hdc: function() {
    var am = new hdc.Amendment(this.getRaw());
    fill(am, this);
    return am;
  },
  
  json: function() {
    return {
      version: this.version,
      currency: this.currency,
      number: this.number,
      previousHash: this.previousHash,
      dividend: this.dividend,
      coinMinPower: this.coinMinPower,
      votersSigRoot: this.votersSigRoot,
      votersRoot: this.votersRoot,
      votersCount: this.votersCount,
      votersChanges: this.votersChanges,
      membersStatusRoot: this.membersStatusRoot,
      membersRoot: this.membersRoot,
      membersCount: this.membersCount,
      membersChanges: this.membersChanges,
      raw: this.getRaw()
    };
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
    if(this.previousHash){
      raw += "PreviousHash: " + this.previousHash + "\n";
    }
    if(this.dividend != null){
      raw += "UniversalDividend: " + this.dividend + "\n";
    }
    if(this.coinMinPower != null){
      raw += "CoinMinimalPower: " + this.coinMinPower + "\n";
    }
    if(this.votersCount > 0){
      raw += "VotersSignaturesRoot: " + this.votersSigRoot + "\n";
      raw += "VotersRoot: " + this.votersRoot + "\n";
      raw += "VotersCount: " + this.votersCount + "\n";
      raw += "VotersChanges:\n";
      for(var j = 0; j < this.votersChanges.length; j++){
        raw += this.votersChanges[j] + "\n";
      }
    }
    raw += "MembersStatusRoot: " + this.membersStatusRoot + "\n";
    raw += "MembersRoot: " + this.membersRoot + "\n";
    raw += "MembersCount: " + this.membersCount + "\n";
    raw += "MembersChanges:\n";
    for(var i = 0; i < this.membersChanges.length; i++){
      raw += this.membersChanges[i] + "\n";
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

  buildMembershipsMerkle: function (done) {
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
          mongoose.model('Merkle').membershipsWrittenForAmendment(previous.number, previous.hash, function (err, merkle) {
            next(err, merkle.leaves());
          });
        },
        function (leaves, next) {
          var newMemberships = [];
          async.forEach(that.getNewMembers(), function (item,callback){
            mongoose.model('Membership').find({ fingerprint: item, basis: that.number }, function (err, memberships) {
              if(err){
                callback(err);
                return;
              }
              if(memberships.length == 0 || memberships.length > 1){
                callback('Integrity error : zero or more that one membership for amendment #' + that.number + ' and member ' + item);
                return;
              }
              newMemberships.push(memberships[0].hash);
              callback();
            });
          }, function(err){
            if(err){
              next(err);                
              return;
            }
            leaves = _(leaves).union(newMemberships);
            next(null, leaves);
          });
        },
        function (leaves, next) {
          var leavingMemberships = [];
          async.forEach(that.getLeavingMembers(), function(item,callback){
            mongoose.model('Membership').find({ fingerprint: item, basis: that.number }, function (err, memberships) {
              if(err){
                callback(err);
                return;
              }
              if(memberships.length == 0 || memberships.length > 1){
                callback('Integrity error : zero or more that one membership for amendment #' + that.number + ' and member ' + item);
                return;
              }
              leavingMemberships.push(memberships[0].hash);
            callback();
            });
          }, function(err){
            if(err){
              next(err);                
              return;
            }
            leaves = _(leaves).difference(leavingMemberships);
            next(null, leaves);
          });
        }
      ], function (err, leaves) {
        if(leaves) leaves.sort();
        done(err, leaves);
      });
    })
  },

  buildSignaturesMerkle: function (done) {
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
          mongoose.model('Merkle').signaturesWrittenForAmendment(previous.number, previous.hash, function (err, merkle) {
            next(err, merkle.leaves());
          });
        },
        function (leaves, next) {
          var newVotes = [];
          async.forEach(that.getNewVoters(), function(item,callback){
            mongoose.model('Vote').find({ issuer: item, basis: that.number }, function (err, votes) {
              if(err){
                callback(err);
                return;
              }
              if(votes.length == 0 || votes.length > 1){
                callback('Integrity error : ' + votes.length + ' signatures for amendment #' + that.number + ' and member ' + item);
                return;
              }
              newVotes.push(votes[0].hash);
              callback();
            });
          }, function(err){
            if(err){
              next(err);                
              return;
            }
            leaves = _(leaves).union(newVotes);
            next(null, leaves);
          });
        },
        function (leaves, next) {
          var leavingVotes = [];
          async.forEach(that.getLeavingVoters(), function(item,callback){
            mongoose.model('Vote').find({ issuer: item, basis: that.number }, function (err, votes) {
              if(err){
                callback(err);
                return;
              }
              if(votes.length == 0 || votes.length > 1){
                callback('Integrity error : ' + votes.length + ' signatures for amendment #' + that.number + ' and member ' + item);
                return;
              }
              leavingVotes.push(votes[0].hash);
              callback();
            });
          }, function(err){
            if(err){
              next(err);                
              return;
            }
            leaves = _(leaves).difference(leavingVotes);
            next(null, leaves);
          });
        }
      ], function (err, leaves) {
        if(leaves) leaves.sort();
        done(err, leaves);
      });
    })
  },

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
          mongoose.model('Merkle').membersWrittenForAmendment(previous.number, previous.hash, function (err, merkle) {
            next(err, merkle.leaves());
          });
        },
        function (leaves, next) {
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
          mongoose.model('Merkle').votersWrittenForAmendment(previous.number, previous.hash, function (err, merkle) {
            next(err, merkle.leaves());
          });
        },
        function (leaves, next) {
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
    fs.readFile(file, {encoding: "utf8"}, function (err, data) {
      obj.parse(data, function(err) {
        done(err);
      });
    });
  }
};

AmendmentSchema.statics.nextNumber = function (done) {
  var that = this;
  async.waterfall([
    function(next){
      Amendment.current(next);
    },
    function(current, next){
      if(!next){
        next = current;
        current = null;
      }
      var number = current ? current.number : 0;
      next(null, number);
    }
  ], done);
};

AmendmentSchema.statics.current = function (done) {

  this.find({ promoted: true }, function (err, amends) {
    if(amends && amends.length == 1){
      done(err, amends[0]);
      return;
    }
    if(!amends || amends.length == 0){
      done(err);
      return;
    }
    if(amends || amends.length > 1){
      var current = undefined;
      amends.forEach(function (am) {
        if(!current || (current && current.number < am.number))
          current = am;
      });
      if(current)
        done(err, current);
      else
        done(err);
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

var Amendment = mongoose.model('Amendment', AmendmentSchema);

function fill (am1, am2) {
  am1.version           = am2.version;
  am1.currency          = am2.currency;
  am1.number            = am2.number;
  am1.previousHash      = am2.previousHash;
  am1.dividend          = am2.dividend;
  am1.coinMinPower      = am2.coinMinPower;
  am1.votersSigRoot     = am2.votersSigRoot;
  am1.votersRoot        = am2.votersRoot;
  am1.votersCount       = am2.votersCount;
  am1.votersChanges     = am2.votersChanges;
  am1.membersStatusRoot = am2.membersStatusRoot;
  am1.membersRoot       = am2.membersRoot;
  am1.membersCount      = am2.membersCount;
  am1.membersChanges    = am2.membersChanges;
  am1.hash              = am2.hash;
}
