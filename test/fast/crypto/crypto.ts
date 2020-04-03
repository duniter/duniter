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
import {Base58decode, Base58encode} from "../../../app/lib/common-libs/crypto/base58"
import {decodeBase64, encodeBase64} from "../../../app/lib/common-libs/crypto/nacl-util"
import {Key} from "../../../app/lib/common-libs/crypto/keyring"
import {verify} from "duniteroxyde"

const should = require('should');

const enc = encodeBase64
const dec = decodeBase64

let pub:Uint8Array, sec:Uint8Array, rawPub:string, rawSec:string

describe('ed25519 tests:', function(){

  before(async () => {
    // Generate the keypair
    const keyPair = new Key('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP');
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
    const sig = new Key(rawPub, rawSec).signSync(msg);
    const verified = verify(msg, sig, rawPub);
    verified.should.equal(true);
    done();
  });

  it('wrong signature from generated key should NOT be verified', function(done){
    const msg = "Some message to be signed";
    const sig = new Key(rawPub, rawSec).signSync(msg);
    const verified = verify(msg + 'delta', sig, rawPub);
    verified.should.equal(false);
    done();
  });

  it('good signature on a Peer document with just BMA should be verified', function(done){
    const msg = "Version: 10\n" +
      "Type: Peer\n" +
      "Currency: g1\n" +
      "PublicKey: 3AF7bhGQRt6ymcBZgZTBMoDsEtSwruSarjNG8kDnaueX\n" +
      "Block: 33291-0000088375C232A4DDAE171BB3D3C51347CB6DC8B7AA8BE4CD4DAEEADF26FEB8\n" +
      "Endpoints:\n" +
      "BASIC_MERKLED_API g1.duniter.org 10901\n"
    const verified = verify(msg, "u8t1IoWrB/C7T+2rS0rKYJfjPG4FN/HkKGFiUO5tILIzjFDvxxQiVC+0o/Vaz805SMmqJvXqornI71U7//+wCg==", "3AF7bhGQRt6ymcBZgZTBMoDsEtSwruSarjNG8kDnaueX");
    verified.should.equal(true);
    done();
  });

  it('good signature on a Peer document with just BMA + BMAS should be verified', function(done){
    const msg = "Version: 10\n" +
      "Type: Peer\n" +
      "Currency: g1\n" +
      "PublicKey: Com8rJukCozHZyFao6AheSsfDQdPApxQRnz7QYFf64mm\n" +
      "Block: 33291-0000088375C232A4DDAE171BB3D3C51347CB6DC8B7AA8BE4CD4DAEEADF26FEB8\n" +
      "Endpoints:\n" +
      "BASIC_MERKLED_API g1.duniter.tednet.fr 37.187.0.204 8999\n" +
      "BMAS g1.duniter.tednet.fr 9000\n"
    const verified = verify(msg, "ImvQDdpGv2M6CxSnBuseM/azJhBUGzWVgQhIvb5L2oGLm2GyLk/Sbi5wkb4IjbjbQfdRPdlcx5zxaHhvZCiWAA==", "Com8rJukCozHZyFao6AheSsfDQdPApxQRnz7QYFf64mm");
    verified.should.equal(true);
    done();
  });

  it('wrong block signature due to oldest tweetnacl should NOT be verified with verify', function(done){
    const msg = "InnerHash: 8B194B5C38CF0A38D16256405AC3E5FA5C2ABD26BE4DCC0C7ED5CC9824E6155B\nNonce: 30400000119992\n";
    const rawSig = "fJusVDRJA8akPse/sv4uK8ekUuvTGj1OoKYVdMQQAACs7OawDfpsV6cEMPcXxrQTCTRMrTN/rRrl20hN5zC9DQ==";
    const verified = verify(msg, rawSig, "D9D2zaJoWYWveii1JRYLVK3J4Z7ZH3QczoKrnQeiM6mx");
    verified.should.equal(false);
    done();
  });

  it('rectified block signature should be verified with verify', function(done){
    const msg = "InnerHash: 8B194B5C38CF0A38D16256405AC3E5FA5C2ABD26BE4DCC0C7ED5CC9824E6155B\nNonce: 30400000119992\n";
    const rawSig = "aZusVDRJA8akPse/sv4uK8ekUuvTGj1OoKYVdMQQ/3+VMaDJ02I795GBBaLgjypZFEKYlPMssJMn/X+F/pxgAw==";
    const verified = verify(msg, rawSig, "D9D2zaJoWYWveii1JRYLVK3J4Z7ZH3QczoKrnQeiM6mx");
    verified.should.equal(true);
    done();
  });
});
