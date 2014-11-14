var mongoose  = require('mongoose');
var async     = require('async');
var sha1      = require('sha1');
var _         = require('underscore');
var Schema    = mongoose.Schema;
var unix2dos  = require('../lib/unix2dos');
var parsers   = require('../lib/streams/parsers/doc');
var constants = require('../lib/constants');
var rawer     = require('../lib/rawer');
var logger    = require('../lib/logger')('pubkey');

var CertificationSchema = new Schema({
  pubkey: String,
  sig: String,
  block_number: { type: Number },
  target: String,
  to: String,
  linked: { type: Boolean, default: false },
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

CertificationSchema.pre('save', function (next) {
  this.updated = Date.now();
  next();
});

CertificationSchema.virtual('from').get(function () {
  return this.pubkey;
});

CertificationSchema.methods = {

  existing: function (done) {
    this.model('Certification').find({ "pubkey": this.pubkey, "sig": this.sig, "block_number": this.block_number, "target": this.target }, function (err, certs) {
      done(err, certs && certs.length > 0 ? certs[0] : null);
    });
  },

  inline: function () {
    return [this.pubkey, this.to, this.block_number, this.sig].join(':');
  }
};

CertificationSchema.statics.fromInline = function (inline) {
  var Certification = this.model('Certification');
  var sp = inline.split(':');
  return new Certification({
    pubkey: sp[0],
    to: sp[1],
    block_number: sp[2],
    sig: sp[3]
  });
};

CertificationSchema.statics.to = function (pubkey, done) {
  var Certification = this.model('Certification');
  Certification.find({ "to": pubkey }, function (err, certs) {
    done(err, certs);
  });
};

CertificationSchema.statics.toTarget = function (hash, done) {
  var Certification = this.model('Certification');
  Certification
    .find({ "target": hash })
    .sort({ "block_number": "-1" })
    .exec(function (err, certs) {
    done(err, certs);
  });
};

CertificationSchema.statics.from = function (pubkey, done) {
  var Certification = this.model('Certification');
  Certification.find({ "pubkey": pubkey }, function (err, certs) {
    done(err, certs);
  });
};

CertificationSchema.statics.findNew = function (done) {
  var Certification = this.model('Certification');
  Certification
    .find({ "linked": false })
    .sort({ "block_number": "-1" })
    .exec(function (err, certs) {
      done(err, certs);
  });
};

module.exports = CertificationSchema;
