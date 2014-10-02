var nacl        = require('tweetnacl');
var scrypt      = require('scrypt');
var base58      = require('./base58');
var naclBinding = require('../../naclb');

const crypto_sign_BYTES = 64;
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
    var m = nacl.util.decodeUTF8(msg);
    var signedMsg = naclBinding.sign(m, sec);
    var sig = new Uint8Array(crypto_sign_BYTES);
    for (var i = 0; i < sig.length; i++) sig[i] = signedMsg[i];
    done(null, nacl.util.encodeBase64(sig));
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
    verified = naclBinding.verify(m, sm, pub);
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
  getKeyPair: function (key, salt, done) {
    getScryptKey(key, salt, function(keyBytes) {
      done(null, nacl.sign.keyPair.fromSeed(keyBytes));
    });
  },

  /*****************************
  *
  *     FUNCTIONAL CRYPTO
  *
  *****************************/

  isValidCertification: function (selfCert, selfSig, otherPubkey, otherSig, otherTime, done) {
    var raw = selfCert + selfSig + '\n' + 'META:TS:' + otherTime + '\n';
    var verified = this.verify(raw, otherSig, otherPubkey);
    done(verified ? null : 'Wrong signature for certification');
  }
};

function getScryptKey(key, salt, callback) {
  // console.log('Derivating the key...');
  scrypt.kdf.config.saltEncoding = "ascii";
  scrypt.kdf.config.keyEncoding = "ascii";
  scrypt.kdf.config.outputEncoding = "base64";
  scrypt.kdf(key, TEST_PARAMS, SEED_LENGTH, salt, function (err, res) {
    callback(dec(res.hash));
  });
}
