var mongoose  = require('mongoose');
var async     = require('async');
var sha1      = require('sha1');
var _         = require('underscore');
var fs        = require('fs');
var Schema    = mongoose.Schema;
var base64    = require('../lib/base64');
var logger    = require('../lib/logger')('dao block');

var BlockSchema = new Schema({
  version: String,
  currency: String,
  nonce: {"type": Number, "default": 0},
  number: {"type": Number, "default": 0},
  powMin: {"type": Number, "default": 0},
  time: {"type": Number, "default": 0},
  dividend: {"type": Number, "default": 0},
  medianTime: {"type": Number, "default": 0},
  UDTime: {"type": Number, "default": 0},
  monetaryMass: {"type": Number, "default": 0},
  previousHash: String,
  previousIssuer: String,
  parameters: String,
  membersCount: {"type": Number, "default": 0},
  identities: Array,
  joiners: Array,
  actives: Array,
  leavers: Array,
  excluded: Array,
  certifications: Array,
  transactions: Array,
  signature: String,
  hash: String,
  issuer: String,
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

BlockSchema.pre('save', function (next) {
  this.updated = Date.now();
  next();
});

BlockSchema.methods = {
};

module.exports = BlockSchema;
