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

var IdentitySchema = new Schema({
  uid: String,
  pubkey: String,
  sig: String,
  revoked: { type: Boolean, default: false },
  currentMSN: { type: Number, default: -1 },
  memberships: Array,
  time: { type: Date, default: Date.now },
  member: { type: Boolean, default: false },
  kick: { type: Boolean, default: false },
  leaving: { type: Boolean, default: false },
  wasMember: { type: Boolean, default: false },
  hash: { type: String, unique: true },
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

IdentitySchema.pre('save', function (next) {
  this.updated = Date.now();
  this.written = this.written || this.member; // A member has always be written once
  this.hash = sha1(this.uid + this.time.timestamp() + this.pubkey).toUpperCase();
  next();
});

// Certifications

IdentitySchema.virtual('certs').get(function () {
  return this._certs || [];
});

IdentitySchema.virtual('certs').set(function (newCertifs) {
  this._certs = (newCertifs && newCertifs.length >= 0 && newCertifs) || [newCertifs];
});

// Signed

IdentitySchema.virtual('signed').get(function () {
  return this._signed || [];
});

IdentitySchema.virtual('signed').set(function (newSigned) {
  this._signed = (newSigned && newSigned.length >= 0 && newSigned) || [newSigned];
});

// Revocation sigature

IdentitySchema.virtual('written').get(function () {
  return this.wasMember || this.member;
});

IdentitySchema.virtual('written').set(function (written) {
  this.wasMember = written;
});

IdentitySchema.methods = {
};

module.exports = IdentitySchema;
