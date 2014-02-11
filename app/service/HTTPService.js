var jpgp     = require('../lib/jpgp');
var async    = require('async');
var mongoose = require('mongoose');
var _        = require('underscore');
var log4js   = require('log4js');
var logger   =  log4js.getLogger('http');

module.exports = new function () {

  this.answer = function(res, code, err, done) {
    if (err) {
      logger.warn(err);
      res.send(code, err);
    }
    else done();
  }

  return this;
}