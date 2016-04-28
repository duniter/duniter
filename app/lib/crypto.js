"use strict";
var _           = require('underscore');
var nacl        = require('tweetnacl');
var scrypt      = require('scryptb');
var base58      = require('./base58');
var rawer       = require('./rawer');
var naclBinding = require('naclb');

nacl.util = require('./nacl-util');

var crypto_sign_BYTES = 64;
var SEED_LENGTH = 32; // Length of the key
// TODO: change key parameters
var TEST_PARAMS = {
  "N":4096,
  "r":16,
  "p":1
};

var enc = nacl.util.encodeBase64,
    dec = nacl.util.decodeBase64;

var that = module.exports;

module.exports = {

  /*****************************
  *
  *      GENERAL CRYPTO
  *
  *****************************/

  sign: function (msg, sec, done) {
    done(null, this.signSync(msg, sec));
  },

  signSync: function (msg, sec) {
    var m = nacl.util.decodeUTF8(msg);
    var signedMsg = naclBinding.sign(m, base58.decode(base58.encode(sec))); // TODO: super weird
    var sig = new Uint8Array(crypto_sign_BYTES);
    for (var i = 0; i < sig.length; i++) sig[i] = signedMsg[i];
    return nacl.util.encodeBase64(sig);
  },

  sign2: function (msg, sec, done) {
    var sig = nacl.sign.detached(nacl.util.decodeUTF8(msg), sec);
    done(null, nacl.util.encodeBase64(sig));
  },

  /**
  * Verify a signature against data & public key.
  * Return true of false as callback argument.
  */
  verifyOld: function (msg, sig, pub, done) {
    var dMsg = nacl.util.decodeUTF8(msg);
    var dSig = nacl.util.decodeBase64(sig);
    var dPub = base58.decode(pub);
    var verified = nacl.sign.detached.verify(dMsg, dSig, dPub);
    if (typeof done == 'function') done(null, verified);
    return verified;
  },

  /**
  * Verify a signature against data & public key.
  * Return true of false as callback argument.
  */
  verify: function (rawMsg, rawSig, rawPub, done) {
    var msg = nacl.util.decodeUTF8(rawMsg);
    var sig = nacl.util.decodeBase64(rawSig);
    var pub = base58.decode(rawPub);
    var m = new Uint8Array(crypto_sign_BYTES + msg.length);
    var sm = new Uint8Array(crypto_sign_BYTES + msg.length);
    var i;
    for (i = 0; i < crypto_sign_BYTES; i++) sm[i] = sig[i];
    for (i = 0; i < msg.length; i++) sm[i+crypto_sign_BYTES] = msg[i];

    // Call to verification lib...
    var verified = naclBinding.verify(m, sm, pub);
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
  },

  /**
  * Generates a new keypair object from salt + password strings.
  * Returns: { publicKey: pubkeyObject, secretKey: secretkeyObject }.
  */
  getKeyPair: function (salt, key, done) {
    getScryptKey(key, salt, function(keyBytes) {
      done(null, nacl.sign.keyPair.fromSeed(keyBytes));
    });
  },

  /*****************************
  *
  *     FUNCTIONAL CRYPTO
  *
  *****************************/

  isValidCertification: function (idty, from, sig, blockID, currency, done) {
    var raw = rawer.getOfficialCertification(_.extend(idty, {
      currency: currency,
      idty_issuer: idty.pubkey,
      idty_uid: idty.uid,
      idty_buid: idty.buid,
      idty_sig: idty.sig,
      issuer: from,
      buid: blockID,
      sig: ''
    }));
    return this.verify(raw, sig, from);
  }
};

function getScryptKey(key, salt, callback) {
  // console.log('Derivating the key...');
  scrypt.hash(key, TEST_PARAMS, SEED_LENGTH, salt, function (err, res) {
    callback(dec(res.toString("base64")));
  });
}
