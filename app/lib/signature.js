var async  = require('async');
var crypto = require('./crypto');
var base58 = require('./base58');

module.exports = {

  async: function (pair, done) {
    done(null, function (msg, cb) {
      crypto.sign(msg, pair.secretKey, cb);
    });
  },

  sync: function (pair, done) {
    var sec = base58.decode(base58.encode(pair.secretKey)); // Weird... TODO: check why need this
    done(null, function (msg) {
      return crypto.signSync(msg, sec);
    });
  }
};
