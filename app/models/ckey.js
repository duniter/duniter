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
  var CKey = this;
  async.waterfall([
    function (next){
      CKey.find({ fingerprint: leaf, operation: op, algorithm: algo, member: isMember }, next);
    },
    function (ckeys, next){
      var ckey = ckeys[0] || new CKey({
        fingerprint: leaf,
        operation: op,
        algorithm: algo,
        member: isMember,
        count: 0
      });
      ckey.count++;
      ckey.save(function (err) {
        next(err, ckey);
      })
    },
  ], done);
}

CKeySchema.statics.findThose = function(op, algo, isMember, done) {
  this.find({ operation: op, algorithm: algo, member: isMember }, done);
}

module.exports = CKeySchema;
