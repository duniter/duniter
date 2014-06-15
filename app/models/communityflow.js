var mongoose = require('mongoose');
var async    = require('async');
var sha1     = require('sha1');
var jpgp     = require('../lib/jpgp');
var _        = require('underscore');
var rawer    = require('../lib/rawer');
var Schema   = mongoose.Schema;

var CommunityFlowSchema = new Schema({
  version: String,
  currency: String,
  issuer: { type: String },
  date: { type: Date },
  amendmentNumber: Number,
  amendmentHash: String,
  algorithm: String,
  membersJoiningCount: Number,
  membersJoiningRoot: String,
  membersLeavingCount: Number,
  membersLeavingRoot: String,
  votersJoiningCount: Number,
  votersJoiningRoot: String,
  votersLeavingCount: Number,
  votersLeavingRoot: String,
  signature: String,
  propagated: { type: Boolean, default: false },
  selfGenerated: { type: Boolean, default: false },
  hash: String,
  sigDate: { type: Date, default: function(){ return new Date(0); } },
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

CommunityFlowSchema.pre('save', function (next) {
  this.updated = Date.now();
  next();
});

CommunityFlowSchema.methods = {

  keyID: function () {
    return this.issuer && this.issuer.length > 24 ? "0x" + this.issuer.substring(24) : "0x?";
  },
  
  json: function() {
    var that = this;
    var json = { raw: this.getRaw() };
    [
      "version",
      "amendmentNumber",
      "membersJoiningCount",
      "membersLeavingCount",
      "votersJoiningCount",
      "votersLeavingCount",
    ].forEach(function(field){
      json[field] = parseInt(that[field], 10);
    });
    [
      "currency",
      "amendmentHash",
      "algorithm",
      "membersJoiningRoot",
      "membersLeavingRoot",
      "votersJoiningRoot",
      "votersLeavingRoot",
      "issuer",
    ].forEach(function(field){
      json[field] = that[field] || "";
    });
    json.date = this.date && this.date.timestamp();
    return json;
  },

  verifySignature: function (publicKey, done) {
    jpgp()
      .publicKey(publicKey)
      .data(this.getRaw())
      .signature(this.signature)
      .verify(publicKey, done);
  },

  getRaw: function() {
    return rawer.getCommunityFlowWithoutSignature(this);
  },

  getRawSigned: function() {
    return rawer.getCommunityFlow(this);
  }
}

CommunityFlowSchema.statics.getTheOne = function (amNumber, issuer, algo, done) {
  this.find({ amendmentNumber: amNumber, issuer: issuer, algorithm: algo }, function (err, entries) {
    if(entries && entries.length == 1){
      done(err, entries[0]);
      return;
    }
    if(!entries || entries.length == 0){
      done('No CommunityFlow entry found');
      return;
    }
    if(entries || entries.length > 1){
      done('More than one CommunityFlow entry found');
    }
  });
}

CommunityFlowSchema.statics.getSelf = function (amNumber, algo, done) {
  this.find({ amendmentNumber: amNumber, algorithm: algo, selfGenerated: true }, function (err, entries) {
    if(entries && entries.length == 1){
      done(err, entries[0]);
      return;
    }
    if(!entries || entries.length == 0){
      done('No CommunityFlow entry found');
      return;
    }
    if(entries || entries.length > 1){
      done('More than one CommunityFlow entry found');
    }
  });
}

CommunityFlowSchema.statics.getForAmendmentAndAlgo = function (amNumber, algo, done) {
  this.find({ amendmentNumber: amNumber, algorithm: algo }, done);
}

module.exports = CommunityFlowSchema;
