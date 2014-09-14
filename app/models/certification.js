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
  time: { type: Date, default: Date.now },
  target: String,
  to: String,
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

CertificationSchema.pre('save', function (next) {
  this.updated = Date.now();
  next();
});

CertificationSchema.methods = {

};

CertificationSchema.statics.exists = function (done) {
  var Identity = this.model('Identity');
  Identity.find({ "pubkey": this.pubkey, "sig": this.sig, "time": this.time, "target": this.target }, function (err, identities) {
    done(err, identities && identities.length > 0);
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
  Certification.find({ "target": hash }, function (err, certs) {
    done(err, certs);
  });
};

CertificationSchema.statics.from = function (pubkey, done) {
  var Certification = this.model('Certification');
  Certification.find({ "pubkey": pubkey }, function (err, certs) {
    done(err, certs);
  });
};

module.exports = CertificationSchema;
