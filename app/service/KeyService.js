var jpgp       = require('../lib/jpgp');
var async      = require('async');
var mongoose   = require('mongoose');
var _          = require('underscore');

module.exports.get = function () {

  this.handleKey = function(key, isManaged, done) {
    key = key || "";
    key = key.toUpperCase();
    async.waterfall([
      function (next){
        var matches = key.match(/^\w{40}$/);
        if(!matches){
          next("Bad key must be a 40 characters SHA-1 hash");
          return;
        }
        next();
      },
      function (next) {
        mongoose.model('Key').setManaged(key, isManaged, next);
      }
    ], done);
  }

  return this;
}