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

import {Base58encode} from "../../../lib/common-libs/crypto/base58"
import {decodeBase64} from "../../../lib/common-libs/crypto/nacl-util"
import * as crypto from 'crypto'

const nacl     = require('tweetnacl');

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
  const keyBytes = await getScryptKey(key, salt, N, r, p)
  const pair = nacl.sign.keyPair.fromSeed(keyBytes);
  return {
    pub: Base58encode(new Buffer(pair.publicKey, 'hex')),
    sec: Base58encode(new Buffer(pair.secretKey, 'hex'))
  };
}

const getScryptKey = async (key:string, salt:string, N:number, r:number, p:number) => {
  const res:any = await new Promise((resolve, reject) => {
    crypto.scrypt(key, salt, SEED_LENGTH, { N, r, p }, (err:any, res:Buffer) => {
      if (err) return reject(err)
      resolve(res)
    })
  })
  return decodeBase64(res.toString("base64"))
}
