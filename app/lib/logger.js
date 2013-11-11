var log4js = require('log4js');

/**
* Convenience function to get logger directly
*/
module.exports = function (name) {

  return log4js.getLogger(name);
}