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
  signature: String,
  created: Date,
  updated: Date
});

MembershipSchema.methods = {
  
  hdc: function() {
    return new hdc.Membership(this.getRaw());
  },
  
  parse: function(rawMembership, callback) {
    var ms = new hdc.Membership(rawMembership);
    fill(this, ms);
    callback(ms.error);
  },

  verify: function (currency, done) {
    return this.hdc().verify(currency);
  },

  verifySignature: function (publicKey, done) {
    jpgp()
      .publicKey(publicKey)
      .data(this.getRaw())
      .noCarriage()
      .signature(this.signature)
      .verify(done);
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
