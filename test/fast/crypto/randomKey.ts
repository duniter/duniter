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

import {Key, randomKey} from "../../../app/lib/common-libs/crypto/keyring"
import {verify} from "duniteroxyde"

const should = require('should');

let key:Key

describe('Random keypair', function(){

  before(async () => {
    // Generate the keypair
    key = randomKey()
  })

  it('good signature from generated key should be verified', function(done){
    const msg = "Some message to be signed";
    const sig = new Key(key.publicKey, key.secretKey).signSync(msg);
    const verified = verify(msg, sig, key.publicKey);
    verified.should.equal(true);
    done();
  });

  it('wrong signature from generated key should NOT be verified', function(done){
    const msg = "Some message to be signed";
    const sig = new Key(key.publicKey, key.secretKey).signSync(msg);
    const verified = verify(msg + 'delta', sig, key.publicKey);
    verified.should.equal(false);
    done();
  });
});
