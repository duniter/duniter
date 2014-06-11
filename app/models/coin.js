var mongoose = require('mongoose');
var async    = require('async');
var sha1     = require('sha1');
var _        = require('underscore');
var jpgp     = require('../lib/jpgp');
var fs       = require('fs');
var hdc      = require('../../node_modules/hdc');
var Schema   = mongoose.Schema;

var CoinSchema = new Schema({
  power: { type: Number },
  issuer: String,
  owner: String,
  amNumber: Number,
  coinNumber: Number,
  transaction: String,
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

CoinSchema.pre('save', function (next) {
  this.updated = Date.now();
  next();
});

CoinSchema.methods = {

  getId: function () {
    return [this.issuer, this.amNumber, this.coinNumber].join('-');
  }
};

CoinSchema.statics.findByOwner = function (fingerprint, done) {

  this.find({ owner: fingerprint }).sort({id: -1}).exec(done);
};

CoinSchema.statics.findByCoinID = function (issuer, amNumber, coinNumber, done) {

  var coindID = [issuer, amNumber, coinNumber].join('-');
  this.find({ issuer: issuer, amNumber: amNumber, coinNumber: coinNumber }).exec(function (err, coins) {
    if(err || coins.length == 0){
      done('Coin ' + coindID + ' not found');
      return;
    }
    if(coins.length > 1){
      done('More that one coin with ID "'+coindID+'" found');
      return;
    }
    done(null, coins[0]);
  });
};

module.exports = CoinSchema;
