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

"use strict";
const co = require('co')
const should = require('should');
const keyring  = require('../../../app/lib/common-libs/crypto/keyring')
const naclUtil = require('../../../app/lib/common-libs/crypto/nacl-util')

const enc = naclUtil.encodeBase64
const dec = naclUtil.decodeBase64

let key;

describe('Random keypair', function(){

  before(() => co(function*() {
    // Generate the keypair
    key = keyring.randomKey()
  }));

  it('good signature from generated key should be verified', function(done){
    const msg = "Some message to be signed";
    const sig = keyring.KeyGen(key.publicKey, key.secretKey).signSync(msg);
    const verified = keyring.verify(msg, sig, key.publicKey);
    verified.should.equal(true);
    done();
  });

  it('wrong signature from generated key should NOT be verified', function(done){
    const msg = "Some message to be signed";
    const cor = dec(enc(msg) + 'delta');
    const sig = keyring.KeyGen(key.publicKey, key.secretKey).signSync(msg);
    const verified = keyring.verify(cor, sig, key.publicKey);
    verified.should.equal(false);
    done();
  });
});
