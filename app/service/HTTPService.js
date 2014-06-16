var log4js   = require('log4js');
var logger   =  require('../lib/logger')('http');

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