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

import * as crypto from 'crypto'
import { KeyPairBuilder, seedToSecretKey } from 'duniteroxyde'

const SEED_LENGTH = 32; // Length of the key

/**
 * Generates a new keypair object from salt + password strings.
 * @param salt
 * @param key
 * @param N Scrypt parameter N. Defaults to 4096.
 * @param r Scrypt parameter r. Defaults to 16.
 * @param p Scrypt parameter p. Defaults to 1.
 * @return keyPair An object containing the public and private keys, base58 encoded.
 */
export const Scrypt = async (salt:string, key:string, N = 4096, r = 16, p = 1) => {
  const res: { pub: string, sec: string } = await new Promise((resolve, reject) => {
    crypto.scrypt(key, salt, SEED_LENGTH, { N, r, p }, (err:any, seed:Buffer) => {
      if (err) return reject(err)
      const pair = KeyPairBuilder.fromSeed(seed);
      resolve({
        pub: pair.getPublicKey(),
        sec: seedToSecretKey(seed)
      })
    })
  })

  return res;
}
