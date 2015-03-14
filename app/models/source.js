var mongoose = require('mongoose');
var async    = require('async');
var _        = require('underscore');
var Schema   = mongoose.Schema;

var SourceSchema = new Schema({
  pubkey: String,
  type: String,
  number: Number,
  fingerprint: String,
  amount: Number,
  consumed: { type: Boolean, default: false },
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

SourceSchema.pre('save', function (next) {
  this.updated = Date.now();
  next();
});

SourceSchema.methods = {
};

module.exports = SourceSchema;
