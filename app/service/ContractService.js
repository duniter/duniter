var async       = require('async');
var mongoose    = require('mongoose');
var _           = require('underscore');
var Amendment   = mongoose.model('Amendment');
var log4js      = require('log4js');
var logger      = require('../lib/logger')('service');

module.exports.get = function (currency, conf) {

  // Reference to currently promoted amendment
  var current;
  var proposed;

  this.current = function (newValue) {
    if (newValue) {
      current = newValue;
    }
    return current;
  };

  this.proposed = function (newValue) {
    if (newValue) {
      proposed = newValue;
    }
    return proposed;
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
        Amendment.getTheOneToBeVoted(current ? current.number + 1 : 0, function (err, am) {
          proposed = am;
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