"use strict";
const moment = require('moment');
const path = require('path');
const winston = require('winston');
const cbLogger = require('./callbackLogger');
const directory = require('../system/directory');

const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
    trace: 4,
    query: 5
  },
  colors: {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    debug: 'cyan',
    trace: 'cyan',
    query: 'grey'
  }
};

// create the logger
const logger = new (winston.Logger)({
  level: 'trace',
  levels: customLevels.levels,
  handleExceptions: false,
  colors: customLevels.colors,
  transports: [
    // setup console logging
    new (winston.transports.Console)({
      level: 'trace',
      levels: customLevels.levels,
      handleExceptions: false,
      colorize: true,
      timestamp: function() {
        return moment().format();
      }
    })
  ]
});

// Singleton
let loggerAttached = false;
logger.addCallbackLogs = (callbackForLog) => {
  if (!loggerAttached) {
    loggerAttached = true;
    logger.add(cbLogger, {
      callback: callbackForLog,
      level: 'trace',
      levels: customLevels.levels,
      handleExceptions: false,
      colorize: true,
      timestamp: function() {
        return moment().format();
      }
    });
  }
};

logger.addHomeLogs = (home) => {
  logger.add(winston.transports.File, {
    level: 'info',
    levels: customLevels.levels,
    handleExceptions: false,
    colorize: true,
    tailable: true,
    maxsize: 50 * 1024 * 1024, // 50 MB
    maxFiles: 3,
    //zippedArchive: true,
    json: false,
    filename: path.join(home, 'duniter.log'),
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
