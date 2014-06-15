var sha1     = require('sha1');
var async    = require('async');
var jpgp     = require('../lib/jpgp');
var fs       = require('fs');
var mongoose = require('mongoose');
var Schema   = mongoose.Schema;
var parsers  = require('../lib/streams/parsers/doc');

var VoteSchema = new Schema({
  issuer: String,
  basis: {"type": Number, "default": 0},
  signature: String,
  hash: String,
  amendmentHash: String,
  propagated: { type: Boolean, default: false },
  selfGenerated: { type: Boolean, default: false },
  sigDate: { type: Date, default: function(){ return new Date(0); } },
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

VoteSchema.pre('save', function (next) {
  this.updated = Date.now();
  next();
});

VoteSchema.virtual('amendment').get(function () {
  return this._amendment;
});

VoteSchema.virtual('amendment').set(function (am) {
  this._amendment = am;
});

VoteSchema.methods = {

  verify: function (currency, done) {
    var that = this;
    async.waterfall([
      function (next){
        jpgp()
          .publicKey(that.pubkey.raw)
          .data(that.amendment.getRaw())
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

  json: function () {
    var that = this;
    return {
      signature: that.signature,
      amendment: that.amendment.json()
    };
  },

  issuerIsVoter: function(done) {
    var Key       = this.model('Key');
    Key.wasVoter(this.issuer, this.amendment.number - 1, done);
  },
  
  parse: function(rawVote, rawPubkey, callback) {
    var PublicKey = this.model('PublicKey');
    var Amendment = this.model('Amendment');
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
            parsers.parsePubkey().asyncWrite(rawPubkey, function (err, obj) {
              that.pubkey = new PublicKey(obj);
              that.issuer = that.pubkey.fingerprint;
              done(null, that);
            })
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
          var parser = parsers.parseAmendment(function (err) {
            if(err)
              done(err);
          });
          parser.end(rawAmendment);
          parser.on('readable', function () {
            var parsed = parser.read();
            if (parsed) {
              var am = new Amendment(parsed);
              that.basis = am.number;
              that.amendmentHash = am.hash;
              Amendment.find({ number: am.number, hash: am.hash }, function (err, ams) {
                that.amendment = ams.length > 0 ? ams[0] : am;
                done(err, that.amendment);
              });
            }
          });

        }
      }, function (err, results) {
        callback(err, that);
      });
    }
    else callback("Amendment could not be parsed in the vote");
  },

  getAmendment: function (done) {
    var Amendment = this.model('Amendment');
    var that = this;
    if(!this.amendment){
      Amendment.findByNumberAndHash(this.basis, this.amendmentHash, function (err, am) {
        that.amendment = am;
        done(err, that.amendment);
      });
    }
    else done(null, this.amendment);
  },

  saveAmendment: function (signaturesLeaves, done) {
    var Merkle    = this.model('Merkle');
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
        // Met à jour la Masse Monétaire
        am.getPrevious(function (err, previous) {
          next(null, previous);
        });
      },
      function (previous, next){
        var prevM = (previous && previous.monetaryMass) || 0;
        var prevUD = (previous && previous.dividend) || 0;
        var prevN = (previous && previous.membersCount) || 0;
        am.monetaryMass = prevM + prevUD*prevN;
        next();
      },
      function (next){
        // Termine la sauvegarde
        am.save(function (err) {
          that.amendmentHash = am.hash;
          that.basis = am.number;
          next(err);
        });
      },
    ], done);
  },

  copyValues: function (to) {
    to.issuer = this.issuer;
    to.hash = this.hash;
    to.signature = this.signature;
    to.amendmentHash = this.amendmentHash;
    to.basis = this.basis;
  },

  getRaw: function() {
    return this.amendment.getRaw();
  },

  getRawSigned: function() {
    return (this.amendment.getRaw() + this.signature).unix2dos();
  }
};

VoteSchema.statics.getForAmendment = function (number, hash, maxDate, done) {

  this.find({ amendmentHash: hash, basis: number, sigDate: { $lte: maxDate } }, done);
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

VoteSchema.statics.getSelf = function (amNumber, done) {
  
  this
    .find({ selfGenerated: true, basis: amNumber })
    .sort({ 'sigDate': -1 })
    .limit(1)
    .exec(function (err, votes) {
      done(null, votes.length == 1 ? votes[0] : null);
  });
};

VoteSchema.statics.getSelfForAlgo = function (amNumber, algo, done) {
  
  this
    .find({ selfGenerated: true, algo: algo, basis: amNumber })
    .sort({ 'sigDate': -1 })
    .limit(1)
    .exec(function (err, votes) {
      done(null, votes.length == 1 ? votes[0] : null);
  });
};

VoteSchema.statics.getByIssuerHashAndBasis = function (issuer, hash, amNumber, done) {
  
  this
    .find({ issuer: issuer, hash: hash, basis: amNumber })
    .limit(1)
    .exec(function (err, votes) {
      done(null, votes.length == 1 ? votes[0] : null);
  });
};

VoteSchema.statics.getByIssuerAmendmentHashAndBasis = function (issuer, hash, amNumber, done) {
  
  this
    .find({ issuer: issuer, amendmentHash: hash, basis: amNumber })
    .limit(1)
    .exec(function (err, votes) {
      done(null, votes.length == 1 ? votes[0] : null);
  });
};

module.exports = VoteSchema;
