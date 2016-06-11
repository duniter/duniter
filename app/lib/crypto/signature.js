"use strict";
var async  = require('async');
var keyring = require('./keyring');
var base58 = require('./base58');

module.exports = {

  asyncSig: (pair) => (msg, cb) => keyring.sign(msg, pair.secretKey, cb),

  sync: function (pair, done) {
    var sec = (pair.secretKeyEnc && base58.decode(pair.secretKeyEnc)) || pair.secretKey;
    var sigF = function (msg) {
      return keyring.signSync(msg, sec);
    };
    done && done(null, sigF);
    return sigF;
  }
};
