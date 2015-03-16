var sha1       = require('sha1');
var async      = require('async');
var merkle     = require('merkle');
var mongoose   = require('mongoose');
var _          = require('underscore');
var fs         = require('fs');
var Schema     = mongoose.Schema;

var MerkleSchema = new Schema({
  type: String,
  criteria: String,
  depth: {"type": Number, "default": 0},
  nodes: {"type": Number, "default": 0},
  levels: Array,
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

MerkleSchema.pre('save', function (next) {
  this.updated = Date.now();
  next();
});

MerkleSchema.methods = {
};

module.exports = MerkleSchema;
