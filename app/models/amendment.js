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
      done('No previous amendment');
      return;
    }
    Amendment.find({ number: this.number - 1, hash: this.previousHash }, function (err, ams) {
      if(ams.length == 0){
        done('Previous amendment not found');
        return;
      }
      if(ams.length > 0){
        done('Multiple previous amendments matches');
        return;
      }
      done(null, ams[0]);
    });
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
