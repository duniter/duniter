var mongoose = require('mongoose');
var async    = require('async');
var _        = require('underscore');
var Schema   = mongoose.Schema;
var logger   = require('../../app/lib/logger')('key model');

var CKeySchema = new Schema({
  fingerprint: { type: String },
  operation: { type: String },
  algorithm: { type: String },
  member: { type: Boolean, default: false },
  count: { type: Number, default: 0 },
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

CKeySchema.pre('save', function (next) {
  this.updated = Date.now();
  next();
});

CKeySchema.statics.increment = function(leaf, op, algo, isMember, done) {
  this.update({ fingerprint: leaf, operation: op, algorithm: algo, member: isMember }, { $inc: { count: 1 }}, done);
}

CKeySchema.statics.findThose = function(op, algo, isMember, done) {
  this.find({ operation: op, algorithm: algo, member: isMember }, done);
}

module.exports = CKeySchema;
