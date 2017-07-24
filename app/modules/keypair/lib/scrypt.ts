"use strict";
import {Base58encode} from "../../../lib/common-libs/crypto/base58"
import {decodeBase64} from "../../../lib/common-libs/crypto/nacl-util"

const nacl     = require('tweetnacl');
const scrypt   = require('scryptb');

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
    scrypt.hash(key, { N, r, p }, SEED_LENGTH, salt, (err:any, res:Buffer) => {
      if (err) return reject(err)
      resolve(res)
    })
  })
  return decodeBase64(res.toString("base64"))
}
