"use strict";
const co  = require('co');
const keyring = require('./keyring');
const base58 = require('./base58');

module.exports = {

  asyncSig: (pair) => (msg, cb) => keyring.sign(msg, pair.secretKey, cb),

  sync: (pair) => co(function*() {
    const sec = (pair.secretKeyEnc && base58.decode(pair.secretKeyEnc)) || pair.secretKey;
    const sigF = function (msg) {
      return keyring.signSync(msg, sec);
    };
    return sigF;
  })
};
