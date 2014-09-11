var nacl   = require('tweetnacl');
var scrypt = require('scrypt');
var base58 = require('./base58');

module.exports = {

  sign: function (msg, sec, done) {
    var sig = nacl.sign.detached(nacl.util.decodeUTF8(msg), sec);
    done(null, nacl.util.encodeBase64(sig));
  },

  /**
  * Verify a signature against data & public key.
  * Return true of false as callback argument.
  */
  verify: function (msg, sig, pub, done) {
    var dMsg = nacl.util.decodeUTF8(msg);
    var dSig = nacl.util.decodeBase64(sig);
    var dPub = base58.decode(pub);
    var verified = nacl.sign.detached.verify(dMsg, dSig, dPub);
    if (typeof done == 'function') done(null, verified);
    return verified;
  },

  /**
  * Verify a signature against data & public key.
  * Return a callback error if signature fails, nothing otherwise.
  */
  verifyCbErr: function (msg, sig, pub, done) {
    var verified = module.exports.verify(msg, sig, pub);
    if (typeof done == 'function') done(verified ? null : 'Signature does not match');
    return verified;
  }
};
