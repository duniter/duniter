var async  = require('async');
var crypto = require('./crypto');

module.exports = function (salt, password, done) {
  async.waterfall([
    function (next) {
      crypto.getKeyPair(password, salt, next);
    },
    function (pair, next){
      next(null, function (msg, cb) {
        crypto.sign(msg, pair.secretKey, cb);
      });
    },
  ], function (err, signFunc) {
    done(err, signFunc);
  });
};
