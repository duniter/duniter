"use strict";
var moment = require('moment');
var path = require('path');
var winston = require('winston');
var directory = require('../lib/directory');

var customLevels = {
  levels: {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  },
  colors: {
    debug: 'cyan',
    info: 'green',
    warn: 'yellow',
    error: 'red'
  }
};

// create the logger
var logger = new (winston.Logger)({
  level: 'debug',
  levels: customLevels.levels,
  handleExceptions: false,
  colors: customLevels.colors,
  transports: [
    // setup console logging
    new (winston.transports.Console)({
      level: 'error',
      levels: customLevels.levels,
      handleExceptions: false,
      colorize: true,
      timestamp: function() {
        return moment().format();
      }
    })
  ]
});

logger.addHomeLogs = (home) => {
  logger.add(winston.transports.File, {
    level: 'error',
    levels: customLevels.levels,
    handleExceptions: false,
    colorize: true,
    tailable: true,
    maxsize: 50 * 1024 * 1024, // 50 MB
    maxFiles: 3,
    //zippedArchive: true,
    json: false,
    filename: path.join(home, 'ucoin.log'),
    timestamp: function() {
      return moment().format();
    }
  });
};

logger.mute = () => {
  logger.remove(winston.transports.Console);
};

/**
* Convenience function to get logger directly
*/
module.exports = () => logger;
