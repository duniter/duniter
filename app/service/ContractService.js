var async       = require('async');
var mongoose    = require('mongoose');
var _           = require('underscore');
var Amendment   = mongoose.model('Amendment');
var log4js      = require('log4js');
var logger      = require('../lib/logger')('service');

module.exports.get = function (currency, conf) {

  // Reference to currently promoted amendment
  var current;

  this.current = function (newValue) {
    if (newValue) {
      current = newValue;
    }
    return current;
  };

  this.load = function (done) {
    async.waterfall([
      function (next){
        Amendment.current(function (err, am) {
          current = am;
          next();
        });
      },
      function (next){
        logger.debug('Loaded service: Contract');
        next();
      },
    ], done);
  };

  return this;
};