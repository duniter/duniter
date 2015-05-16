"use strict";
var log4js = require('log4js');
var path = require('path');

log4js.configure(path.join(__dirname, '/../../conf/logs.json'), { reloadSecs: 60 });

/**
* Convenience function to get logger directly
*/
module.exports = function (name) {

  var logger = log4js.getLogger(name || 'default');
  logger.setLevel('DEBUG');
  return logger;
}
