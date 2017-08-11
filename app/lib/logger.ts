"use strict";
const moment = require('moment');
const path = require('path');
const winston = require('winston');

/***************
 * CALLBACK LOGGER
 ***************/

const util = require('util');

const CallbackLogger:any = winston.transports.CallbackLogger = function (options:any) {

  this.name = 'customLogger';
  this.level = options.level || 'info';
  this.callback = options.callback;
  this.timestamp = options.timestamp;
};

util.inherits(CallbackLogger, winston.Transport);

CallbackLogger.prototype.log = function (level:string, msg:string, meta:any, callback:any) {
  this.callback(level, msg, this.timestamp());
  callback(null, true);
};

/***************
 * NORMAL LOGGER
 ***************/

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

// Singletons
let loggerAttached = false;
logger.addCallbackLogs = (callbackForLog:any) => {
  if (!loggerAttached) {
    loggerAttached = true;
    logger.add(CallbackLogger, {
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

// Singletons
let loggerHomeAttached = false;
logger.addHomeLogs = (home:string, level:string) => {
  if (!muted) {
    if (loggerHomeAttached) {
      logger.remove(winston.transports.File);
    }
    loggerHomeAttached = true;
    logger.add(winston.transports.File, {
      level: level || 'info',
      levels: customLevels.levels,
      handleExceptions: false,
      colorize: true,
      tailable: true,
      maxsize: 50 * 1024 * 1024, // 50 MB
      maxFiles: 3,
      //zippedArchive: true,
      json: false,
      filename: path.join(home, 'duniter.log'),
      timestamp: function () {
        return moment().format();
      }
    })
  }
};

let muted = false;
logger.mute = () => {
  if (!muted) {
    logger.remove(winston.transports.Console);
    muted = true;
  }
};

logger.unmute = () => {
  if (muted) {
    muted = false
    logger.add(winston.transports.Console, {
      level: 'trace',
      levels: customLevels.levels,
      handleExceptions: false,
      colorize: true,
      timestamp: function() {
        return moment().format();
      }
    })
  }
}

/**
* Convenience function to get logger directly
*/
export function NewLogger() {
  return logger
}
