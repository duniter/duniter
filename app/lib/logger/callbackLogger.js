"use strict";

const util = require('util');
const winston = require('winston');

const CallbackLogger = winston.transports.CallbackLogger = function (options) {
  
  this.name = 'customLogger';
  this.level = options.level || 'info';
  this.callback = options.callback;
  this.timestamp = options.timestamp;
};

util.inherits(CallbackLogger, winston.Transport);

CallbackLogger.prototype.log = function (level, msg, meta, callback) {
  this.callback(level, msg, this.timestamp());
  callback(null, true);
};

module.exports = CallbackLogger;
