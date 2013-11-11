var sha1      = require('sha1');
var async     = require('async');
var jpgp      = require('../lib/jpgp');
var mongoose  = require('mongoose');
var fs        = require('fs');
var PublicKey = mongoose.model('PublicKey');
var Amendment = mongoose.model('Amendment');
var Merkle    = mongoose.model('Merkle');
var Schema    = mongoose.Schema;

var VoteSchema = new Schema({
  issuer: String,
  basis: {"type": Number, "default": 0},
  signature: String,
  _amendment: Schema.Types.ObjectId,
  hash: String,
  amendmentHash: String,
  propagated: { type: Boolean, default: false },
  sigDate: { type: Date, default: function(){ return new Date(0); } },
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

VoteSchema.pre('save', function (next) {
  this.updated = Date.now();
  next();
});

VoteSchema.methods = {

  verify: function (currency, done) {
    var that = this;
    async.waterfall([
      function (next){
        that.getAmendment(next);
      },
      function (am, next){
        am.verify(currency, next);
      },
      function (verified, next){
        jpgp()
          .publicKey(that.pubkey.raw)
          .data(that.amendment.getRaw())
          .noCarriage()
          .signature(that.signature)
          .verify(next);
      },
      function (verified, next) {
        if(!verified){
          next('Bad signature for amendment');
          return;
        }
        next(null, true);
      }
    ], done);
    return this;
  },

  issuerIsMember: function(done) {
    var that = this;
    Amendment.current(function (err, current) {
      if(err){
        // No amendmennt, thus no member
        done(null, false);
        return;
      }
      async.waterfall([
        function (next){
          Merkle.membersWrittenForAmendment(current.number, current.hash, next);
        },
        function (membersMerkle, next){
          next(null, ~membersMerkle.leaves().indexOf(that.issuer));
        }
      ], done);
    });
  },

  issuerIsVoter: function(done) {
    var that = this;
    Amendment.current(function (err, current) {
      if(err){
        // No amendmennt, thus no member
        done(null, false);
        return;
      }
      async.waterfall([
        function (next){
          Merkle.votersWrittenForAmendment(current.number, current.hash, next);
        },
        function (votersMerkle, next){
          next(null, ~votersMerkle.leaves().indexOf(that.issuer));
        }
      ], done);
    });
  },
  
  parse: function(rawVote, rawPubkey, callback) {
    if(!callback && rawPubkey){
      callback = rawPubkey;
      rawPubkey = null;
    }
    var that = this;
    var sigIndex = rawVote.indexOf("-----BEGIN");
    if(~sigIndex){
      var rawAmendment = rawVote.substring(0, sigIndex);
      this.signature = rawVote.substring(sigIndex);
      this.hash = sha1(this.signature).toUpperCase();
      try{
        this.sigDate = jpgp().signature(this.signature).signatureDate();
      }
      catch(ex){}
      async.parallel({
        pubkey: function(done){
          if(rawPubkey){
            var k = new PublicKey({ raw: rawPubkey });
            k.construct(function () {
              that.pubkey = k;
              that.issuer = k.fingerprint;
              done(null, that);
            });
            return;
          }
          PublicKey.getFromSignature(that.signature, function (err, publicKey) {
            if(err){
              done(err);
              return;
            }
            that.pubkey = publicKey;
            that.issuer = publicKey.fingerprint;
            done(null, that);
          });
        },
        amendment: function(done){
          var am = new Amendment();
          am.parse(rawAmendment, function (err) {
            if(err){
              done(err, am);
              return;
            }
            that.basis = am.number;
            that.amendmentHash = am.hash;
            Amendment.find({ number: am.number, hash: am.hash }, function (err, ams) {
              that.amendment = ams.length > 0 ? ams[0] : am;
              done(err, that.amendment);
            });
          });
        }
      }, function (err, results) {
        callback(err, that);
      });
    }
    else callback("Amendment could not be parsed in the vote");
  },

  getAmendment: function (done) {
    var that = this;
    if(!this.amendment){
      Amendment.findById(this._amendment, function (err, am) {
        that.amendment = am;
        done(err, that.amendment);
      });
    }
    else done(null, this.amendment);
  },

  saveAmendment: function (signaturesLeaves, done) {
    var that = this;
    var am;
    async.waterfall([
      function (next){
        that.getAmendment(next);
      },
      function (amendment, next){
        am = amendment;
        next();
      },
      function (next){
        // Donne le Merkle des signatures (hdc/amendments/[AMENDMENT_ID]/signatures)
        Merkle.signaturesWrittenForAmendment(am.number, am.hash, next);
      },
      function (merkle, next){
        // Met à jour le Merkle
        merkle.initialize(signaturesLeaves);
        merkle.save(function (err){
          next(err);
        });
      },
      function (next){
        am.save(function (err) {
          next(err);
        });
      },
      function (next){
        that._amendment = am._id;
        next(null, am);
      }
    ], done);
  },

  copyValues: function (to) {
    to.issuer = this.issuer;
    to.hash = this.hash;
    to.signature = this.signature;
    to._amendment = this._amendment;
  },

  loadFromFiles: function(voteFile, amendFile, pubkeyFile, done) {
    var obj = this;
    var voteData = fs.readFileSync(voteFile, 'utf8');
    var amendData = fs.readFileSync(amendFile, 'utf8');
    var pubkey = fs.readFileSync(pubkeyFile, 'utf8');
    obj.parse(amendData + voteData, pubkey, function (err) {
      if(err){
        done(err);
        return;
      }
      var am = new Amendment();
      am.parse(amendData, function (err) {
        obj.amendment = am;
        done(err);
      });
    });
    return this;
  }
};

VoteSchema.statics.findByHashAndBasis = function (hash, basis, done) {

  this.find({ hash: hash, basis: basis }, function (err, votes) {
    if(votes && votes.length == 1){
      done(err, votes[0]);
      return;
    }
    if(!votes || votes.length == 0){
      done('No amendment found');
      return;
    }
    if(votes || votes.length > 1){
      done('More than one amendment found');
    }
  });
};

var Vote = mongoose.model('Vote', VoteSchema);