var mongoose = require('mongoose');
var async    = require('async');
var sha1     = require('sha1');
var _        = require('underscore');
var rawer    = require('../lib/rawer');
var dos2unix = require('../lib/dos2unix');
var Schema   = mongoose.Schema;

var MembershipSchema = new Schema({
  version: String,
  currency: String,
  issuer: { type: String },
  membership: String,
  type: String,
  userid: String,
  current: { type: Boolean, default: false },
  signature: String,
  certts: { type: Date },
  block: String,
  propagated: { type: Boolean, default: false },
  number: Number,
  fpr: String,
  hash: String,
  sigDate: { type: Date, default: function(){ return new Date(0); } },
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

MembershipSchema.pre('save', function (next) {
  this.updated = Date.now();
  next();
});

MembershipSchema.virtual('pubkey').get(function () {
  return this._pubkey;
});

MembershipSchema.virtual('pubkey').set(function (am) {
  this._pubkey = am;
});

MembershipSchema.virtual('amHash').get(function () {
  return this._amHash;
});

MembershipSchema.virtual('amHash').set(function (am) {
  this._amHash = am;
});

MembershipSchema.methods = {
}

module.exports = MembershipSchema;
