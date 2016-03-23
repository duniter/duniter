"use strict";

let util = require('util');
let winston = require('winston');

var CallbackLogger = winston.transports.CallbackLogger = function (options) {
  
  this.name = 'customLogger';
  this.level = options.level || 'info';
  this.callback = options.callback;
};

util.inherits(CallbackLogger, winston.Transport);

CallbackLogger.prototype.log = function (level, msg, meta, callback) {
  this.callback(level, msg);
  callback(null, true);
};

module.exports = CallbackLogger;
