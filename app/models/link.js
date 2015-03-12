var mongoose = require('mongoose');
var async    = require('async');
var _        = require('underscore');
var Schema   = mongoose.Schema;

var LinkSchema = new Schema({
  source: String,
  target: String,
  timestamp: String,
  obsolete: { type: Boolean, default: false },
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

LinkSchema.pre('save', function (next) {
  this.updated = Date.now();
  next();
});

LinkSchema.methods = {
};

module.exports = LinkSchema;
