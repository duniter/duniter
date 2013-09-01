var sha1     = require('sha1');
var async    = require('async');
var jpgp     = require('../lib/jpgp');
var mongoose = require('mongoose');
var fs       = require('fs');
var hdc      = require('hdc');
var Schema   = mongoose.Schema;

var MembershipSchema = new Schema({
  version: {"type": Number, "default": 0},
  currency: String,
  status: String,
  basis: {"type": Number, "default": 0},
  fingerprint: String,
  hash: String,
  signature: String,
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

MembershipSchema.pre('save', function (next) {
  this.updated = Date.now();
  next();
});

MembershipSchema.methods = {
  
  hdc: function() {
    return new hdc.Membership(this.getRaw());
  },
  
  copyValues: function(to) {
    fill(to, this);
    to.fingerprint = this.fingerprint;
    to.signature = this.signature;
  },
  
  parse: function(rawMembership, callback) {
    var ms = new hdc.Membership(rawMembership);
    var sigIndex = rawMembership.indexOf("-----BEGIN");
    if(~sigIndex)
      this.signature = rawMembership.substring(sigIndex);
    this.hash = sha1(rawMembership).toUpperCase();
    fill(this, ms);
    callback(ms.error, this);
  },

  verify: function (currency, done) {
    var hdcMS = this.hdc();
    var valid = hdcMS.verify(currency);
    if(!valid && done){
      done(hdcMS.error, valid);
    }
    if(valid && done){
      done(null, valid);
    }
    return valid;
  },

  verifySignature: function (publicKey, done) {
    jpgp()
      .publicKey(publicKey)
      .data(this.getRaw())
      .noCarriage()
      .signature(this.signature)
      .verify(publicKey, done);
  },

  getRaw: function() {
    var raw = "";
    raw += "Version: " + this.version + "\n";
    raw += "Currency: " + this.currency + "\n";
    raw += "Status: " + this.status + "\n";
    raw += "Basis: " + this.basis + "\n";
    return raw.unix2dos();
  },

  getSignature: function() {
    return this.signature;
  },

  checkCoherence: function(done) {
    var that = this;
    async.waterfall([
      function (next){
        mongoose.model('Membership').find({ fingerprint: that.fingerprint }).sort('-basis').exec(next);
      },
      function (mems, next){
        mongoose.model('Amendment').current(function  (err, am) {
          next(null, mems, (am ? am.number : -1));
        })
      },
      function (mems, number, next){
        // First time joining
        if(mems.length == 0 && that.status != 'JOIN'){
          next('May only JOIN the community first');
          return;
        }
        else if(mems.length == 0){
          next();
          return;
        }
        // Already done
        if(mems[0].basis <= number && mems[0].status == 'JOIN' && that.status == 'JOIN'){
          next('Already joined the community');
          return;
        }
        if(mems[0].basis <= number && mems[0].status == 'LEAVE' && that.status != 'JOIN'){
          next('Forbidden: may only JOIN the community after leaving it');
          return;
        }
        if(mems[0].basis <= number && mems[0].status == 'ACTUALIZE' && that.status == 'JOIN'){
          next('Forbidden: may only ACTUALIZE or LEAVE the community after joining it');
          return;
        }
        // Waiting for NEXT amendment
        if(mems[0].basis > number && mems[0].status == 'JOIN' && that.status != 'JOIN'){
          next('Forbidden: may only JOIN the community at this step');
          return;
        }
        if(mems[0].basis > number && mems[0].status != 'JOIN' && that.status == 'JOIN'){
          next('Forbidden: may only ACTUALIZE or LEAVE the community at this step');
          return;
        }
        next();
      }
    ], done);
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

MembershipSchema.statics.verify = function (membership, signature, publicKey, done) {
};

var Membership = mongoose.model('Membership', MembershipSchema);


function fill (ms1, ms2) {
  ms1.version  = ms2.version;
  ms1.currency = ms2.currency;
  ms1.status   = ms2.status;
  ms1.basis    = ms2.basis;
  ms1.hash     = ms2.hash;
}
