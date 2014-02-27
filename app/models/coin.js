var mongoose = require('mongoose');
var async    = require('async');
var sha1     = require('sha1');
var _        = require('underscore');
var jpgp     = require('../lib/jpgp');
var fs       = require('fs');
var hdc      = require('../../node_modules/hdc');
var Schema   = mongoose.Schema;

var CoinSchema = new Schema({
  id: { type: String, unique: true },
  number: { type: Number },
  owner: String,
  transaction: String,
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

CoinSchema.pre('save', function (next) {
  this.updated = Date.now();
  next();
});

CoinSchema.methods = {
};

CoinSchema.statics.findByOwner = function (fingerprint, done) {

  this.find({ owner: fingerprint }).sort({number: -1}).exec(done);
};

CoinSchema.statics.findLastOfOwner = function (fingerprint, done) {

  this.find({ owner: fingerprint }).sort({number: -1}).limit(1).exec(function (err, coins) {
    done(err, coins && coins[0]);
  });
};

CoinSchema.statics.findByCoinID = function (coindID, done) {

  this.find({ id: new RegExp('^'+coindID+'-') }).exec(function (err, coins) {
    if(err || coins.length == 0){
      done('Coin not found');
      return;
    }
    if(coins.length > 1){
      done('More that one coin with ID "'+coindID+'" found');
      return;
    }
    done(null, coins[0]);
  });
};

var Coin = mongoose.model('Coin', CoinSchema);
