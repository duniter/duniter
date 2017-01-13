"use strict";
const nacl        = require('tweetnacl');
const base58      = require('./base58');
const naclBinding = require('naclb');

nacl.util = require('./nacl-util');

const crypto_sign_BYTES = 64;

/**
 * Verify a signature against data & public key.
 * Return true of false as callback argument.
 */
function verify(rawMsg, rawSig, rawPub) {
  const msg = nacl.util.decodeUTF8(rawMsg);
  const sig = nacl.util.decodeBase64(rawSig);
  const pub = base58.decode(rawPub);
  const m = new Uint8Array(crypto_sign_BYTES + msg.length);
  const sm = new Uint8Array(crypto_sign_BYTES + msg.length);
  let i;
  for (i = 0; i < crypto_sign_BYTES; i++) sm[i] = sig[i];
  for (i = 0; i < msg.length; i++) sm[i+crypto_sign_BYTES] = msg[i];

  // Call to verification lib...
  return naclBinding.verify(m, sm, pub);
}

function Key(pub, sec) {
  /*****************************
  *
  *      GENERAL CRYPTO
  *
  *****************************/

  this.publicKey = pub;
  this.secretKey = sec;

  const rawSec = () => base58.decode(this.secretKey);

  this.json = () => { return {
    pub: this.publicKey,
    sec: this.secretKey
  }};

  this.sign = (msg) => Promise.resolve(this.signSync(msg));

  this.signSync = (msg) => {
    const m = nacl.util.decodeUTF8(msg);
    const signedMsg = naclBinding.sign(m, rawSec()); // TODO: super weird
    const sig = new Uint8Array(crypto_sign_BYTES);
    for (let i = 0; i < sig.length; i++) {
      sig[i] = signedMsg[i];
    }
    return nacl.util.encodeBase64(sig);
  };
}

module.exports ={
  Key: (pub, sec) => new Key(pub, sec),
  verify: verify
};
