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

import {KeyGen, verifyBuggy} from "../../../../app/lib/common-libs/crypto/keyring"
import {Base58decode, Base58encode} from "../../../../app/lib/common-libs/crypto/base58"

const should = require('should');

let pub:Uint8Array, sec:Uint8Array, rawPub:string, rawSec:string

describe('ed25519 tests:', function(){

  before(async () => {
    // Generate the keypair
    const keyPair = KeyGen('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP');
    pub = Base58decode(keyPair.publicKey);
    sec = Base58decode(keyPair.secretKey);
    rawPub = Base58encode(new Buffer(pub));
    rawSec = Base58encode(new Buffer(sec));
  })

  //it('good signature from existing secret key should be verified', function(done){
  //  const keys = nacl.sign.scryptKeyPair.fromSecretKey(dec("TM0Imyj/ltqdtsNG7BFOD1uKMZ81q6Yk2oz27U+4pvs9QBfD6EOJWpK3CqdNG368nJgszy7ElozAzVXxKvRmDA=="));
  //  const msg = "cg==";
  //  const goodSig = dec("52Hh9omo9rxklulAE7gvVeYvAq0GgXYoZE2NB/gzehpCYIT04bMcGIs5bhYLaH93oib34jsVMWs9Udadr1B+AQ==");
  //  const sig = crypto.signSync(msg, keys.secretKey);
  //  sig.should.equal(enc(goodSig));
  //  crypto.verify(msg, sig, enc(keys.publicKey)).should.be.true;
  //  done();
  //});

  it('good signature from generated key should be verified', function(done){
    const msg = "Some message to be signed";
    const sig = KeyGen(rawPub, rawSec).signSyncBuggy(msg);
    const verified = verifyBuggy(msg, sig, rawPub);
    verified.should.equal(true);
    done();
  });

  it('wrong signature from generated key should NOT be verified', function(done){
    const msg = "Some message to be signed";
    const sig = KeyGen(rawPub, rawSec).signSyncBuggy(msg);
    const verified = verifyBuggy(msg + 'delta', sig, rawPub);
    verified.should.equal(false);
    done();
  });
});
