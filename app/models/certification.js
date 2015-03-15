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

CertificationSchema.virtual('idty').get(function () {
  return this._idty || '';
});

CertificationSchema.virtual('idty').set(function (idty) {
  this._idty = idty;
});

CertificationSchema.pre('save', function (next) {
  this.updated = Date.now();
  next();
});

CertificationSchema.virtual('from').get(function () {
  return this.pubkey;
});

CertificationSchema.methods = {
};

module.exports = CertificationSchema;
