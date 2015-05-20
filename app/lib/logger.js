"use strict";
var winston = require('winston');
var loggers = [];
var currentLevel = 'error';

/**
* Convenience function to get logger directly
*/

var newLogger = function () {
  var newInstance = new (winston.Logger)({
    transports: [
      new (winston.transports.Console)({ level: 'debug' })
    ]
  });
  newInstance.level = currentLevel || 'debug';
  loggers.push(newInstance);
  return newInstance;
};

newLogger.setLevel = function(level) {
  currentLevel = level;
  loggers.forEach(function(logger){
    logger.level = level;
  });
};

module.exports = newLogger;
