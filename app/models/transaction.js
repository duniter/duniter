var mongoose = require('mongoose');
var async    = require('async');
var sha1     = require('sha1');
var _        = require('underscore');
var fs       = require('fs');
var rawer    = require('../lib/rawer');
var Schema   = mongoose.Schema;

var TransactionSchema = new Schema({
  version: String,
  currency: String,
  hash: String,
  issuers: [String],
  inputs: [String],
  outputs: [String],
  signatures: [String],
  comment: String,
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

TransactionSchema.pre('save', function (next) {
  this.updated = Date.now();
  next();
});

TransactionSchema.methods = {
};

module.exports = TransactionSchema;
