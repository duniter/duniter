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

import {KeyPairBuilder, generateRandomSeed, seedToSecretKey} from "duniteroxyde"

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

  json() {
    return {
      pub: this.publicKey,
      sec: this.secretKey
    }
  }

  sign(msg:string) {
    return Promise.resolve(this.signSync(msg))
  }

  signSync(msg:string) {
    const signator = KeyPairBuilder.fromSecretKey(this.secretKey);
    return signator.sign(msg);
  };
}

export function randomKey() {
  const seed = generateRandomSeed();
  const secretKey = seedToSecretKey(seed);
  const keypair = KeyPairBuilder.fromSecretKey(secretKey);
  return new Key(
    keypair.getPublicKey(),
    secretKey,
  )
}
