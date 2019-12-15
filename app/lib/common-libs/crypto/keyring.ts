// Source file from duniter: Crypto-currency software to manage libre currency such as Ğ1
// Copyright (C) 2018  Cedric Moreau <cem.moreau@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

import {Base58decode, Base58encode} from "./base58"
import {decodeBase64, decodeUTF8, encodeBase64} from "./nacl-util"

const nacl        = require('tweetnacl');
const seedrandom  = require('seedrandom');
const naclBinding = require('naclb');

const crypto_sign_BYTES = 64;

export class Key {

  constructor(readonly pub:string, readonly sec:string) {
  }

  /*****************************
  *
  *      GENERAL CRYPTO
  *
  *****************************/

  get publicKey() {
    return this.pub
  }

  get secretKey() {
    return this.sec
  }

  private rawSec() {
    return Base58decode(this.secretKey)
  }

  json() {
    return {
      pub: this.publicKey,
      sec: this.secretKey
    }
  }

  signBuggy(msg:string) {
    return Promise.resolve(this.signSyncBuggy(msg))
  }

  signSyncBuggy(msg:string) {
    const m = decodeUTF8(msg);
    const signedMsg = naclBinding.sign(m, this.rawSec());
    const sig = new Uint8Array(crypto_sign_BYTES);
    for (let i = 0; i < sig.length; i++) {
      sig[i] = signedMsg[i];
    }
    return encodeBase64(sig)
  };

  sign(msg:string) {
    return Promise.resolve(this.signSync(msg))
  }

  signSync(msg:string) {
    const m = decodeUTF8(msg);
    const signedMsg = nacl.sign(m, this.rawSec());
    const sig = new Uint8Array(crypto_sign_BYTES);
    for (let i = 0; i < sig.length; i++) {
      sig[i] = signedMsg[i];
    }
    return encodeBase64(sig)
  };
}

export function randomKey() {
  const byteseed = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    byteseed[i] = Math.floor(seedrandom()() *  255) + 1
  }
  const keypair = nacl.sign.keyPair.fromSeed(byteseed)
  return new Key(
    Base58encode(new Buffer(keypair.publicKey)),
    Base58encode(new Buffer(keypair.secretKey))
  )
}

export function KeyGen(pub:string, sec:string) {
  return new Key(pub, sec)
}

/**
 * Verify a signature against data & public key.
 * Return true of false as callback argument.
 */
export function verifyBuggy(rawMsg:string, rawSig:string, rawPub:string) {
  const msg = decodeUTF8(rawMsg);
  const sig = decodeBase64(rawSig);
  const pub = Base58decode(rawPub);
  const m = new Uint8Array(crypto_sign_BYTES + msg.length);
  const sm = new Uint8Array(crypto_sign_BYTES + msg.length);
  let i;
  for (i = 0; i < crypto_sign_BYTES; i++) sm[i] = sig[i];
  for (i = 0; i < msg.length; i++) sm[i+crypto_sign_BYTES] = msg[i];

  // Call to verification lib...
  return naclBinding.verify(m, sm, pub);
}

/**
 * Verify a signature against data & public key.
 * Return true of false as callback argument.
 */
export function verify(rawMsg:string, rawSig:string, rawPub:string) {
  const msg = decodeUTF8(rawMsg);
  const sig = decodeBase64(rawSig);
  const pub = Base58decode(rawPub);

  // Call to verification lib...
  return nacl.sign.detached.verify(msg, sig, pub);
}
