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
      membershipsMerkle: function(callback){
        build(Merkle.membershipsWrittenForAmendment, that.buildMembershipsMerkle, callback);
      },
      signaturesMerkle: function(callback){
        build(Merkle.signaturesWrittenForAmendment, that.buildSignaturesMerkle, callback);
      },
      membersMerkle: function(callback){
        build(Merkle.membersWrittenForAmendment, that.buildMembersMerkle, callback);
      },
      votersMerkle: function(callback){
        build(Merkle.votersWrittenForAmendment, that.buildVotersMerkle, callback);
      }
    }, done);
  },

  /**
  * Computes a the Merkle tree of memberships fetching previous amendment's Merkle and applying it recorded memberships changes.
  */
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
          // Get memberships of the previous amendment
          mongoose.model('Merkle').membershipsWrittenForAmendment(previous.number, previous.hash, function (err, merkle) {
            next(err, merkle.leaves());
          });
        },
        function (leaves, next) {
          if(!previous){
            next(null, leaves, []);
            return;
          }
          mongoose.model('Merkle').membersWrittenForAmendment(previous.number, previous.hash, function (err, merkle) {
            next(err, leaves, merkle.leaves());
          });
        },
        function (leaves, members, next) {
          // Get memberships of ACTUALIZE of this amendment (pending actually)
          // TODO: add outdated memberships requests
          var actuMembers = _(members).difference(that.getNewMembers(), that.getLeavingMembers());
          async.forEach(actuMembers, function(item, callback){
            async.waterfall([
              function (cb){
                mongoose.model('Membership').find({ fingerprint: item, basis: that.number, status: 'ACTUALIZE' }, function (err, memberships) {
                  if(memberships.length > 1){
                    cb('Integrity error : more than one (' + memberships.length + ') ACTUALIZE membership for amendment');
                    return;
                  }
                  cb(null, memberships[0]);
                });
              },
              function (actuMS, cb){
                if(arguments.length == 1){
                  cb = actuMS;
                  actuMS = null;
                }
                mongoose.model('Membership').find({ fingerprint: item }).sort('-number').exec(function (err, memberships) {
                  cb(null, actuMS, memberships[0]);
                });
              }
            ], function (err, actuMS, oldMS) {
              if(err){
                callback(err);
                return;
              }
              if(actuMS){
                if(oldMS){
                  var index = leaves.indexOf(oldMS.hash);
                  if(~index){
                    leaves.splice(index, 1);
                  }
                }
                leaves.push(actuMS.hash);
              }
              callback();
            });
          }, function(err){
            if(err){
              next(err);                
              return;
            }
            next(null, leaves);
          });
        },
        function (leaves, next) {
          // Remove LEAVE membership of old amendment
          mongoose.model('Membership').find({ basis: that.number-1, hash: { $in: leaves }, status: 'LEAVE' }, function (err, memberships) {
            memberships.forEach(function (ms) {
              leaves.splice(leaves.indexOf(ms.hash), 1);
            });
            next(null, leaves);
          });
        },
        function (leaves, next) {
          var newMemberships = [];
          // Get memberships of JOIN or ACTUALIZE of this amendment (pending actually)
          async.forEach(that.getNewMembers(), function (item,callback){
            mongoose.model('Membership').find({ fingerprint: item, basis: that.number, status: 'JOIN' }, function (err, memberships) {
              if(err){
                callback(err);
                return;
              }
              if(memberships.length > 1){
                callback('Integrity error : more that one (' + that.number + ') JOIN for amendment');
                return;
              }
              if(memberships.length == 1){
                newMemberships.push(memberships[0].hash);
              }
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
          var leavingMemberships = {};
          // Get memberships of LEAVE of this amendment (pending actually)
          // TODO: add outdated memberships requests
          async.forEach(that.getLeavingMembers(), function(item,callback){
            async.waterfall([
              function (next){
                mongoose.model('Membership').find({ fingerprint: item, basis: that.number, status: 'LEAVE' }, function (err, memberships) {
                  if(memberships.length > 1){
                    next('Integrity error : more than one (' + memberships.length + ') LEAVE membership for amendment');
                    return;
                  }
                  next(null, memberships[0]);
                });
              },
              function (leaveMS, next){
                mongoose.model('Membership').find({ fingerprint: item }).sort('-number').exec(function (err, memberships) {
                  next(null, leaveMS, memberships[0]);
                });
              }
            ], function (err, leaveMS, oldMS) {
              if(err){
                callback(err);
                return;
              }
              if(oldMS){
                var index = leaves.indexOf(oldMS.hash);
                if(~index){
                  leaves.splice(index, 1);
                }
              }
              leaves.push(leaveMS.hash);
              callback();
            });
          }, function(err){
            if(err){
              next(err);                
              return;
            }
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
          mongoose.model('Merkle').signaturesOfAmendment(previous.number, previous.hash, function (err, merkle) {
            next(err, merkle.leaves());
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
