"use strict";
const should = require('should');
const co  = require('co');
const nacl   = require('tweetnacl');
const base58 = require('../../../app/lib/common-libs/crypto/base58')
const naclUtil = require('../../../app/lib/common-libs/crypto/nacl-util')
const keyring      = require('../../../app/lib/common-libs/crypto/keyring')

const Base58decode = base58.Base58decode
const Base58encode = base58.Base58encode

const enc = naclUtil.encodeBase64
const dec = naclUtil.decodeBase64

let pub, sec, rawPub, rawSec;

describe('ed25519 tests:', function(){

  before(() => co(function*() {
    // Generate the keypair
    const keyPair = keyring.KeyGen('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP');
    pub = Base58decode(keyPair.publicKey);
    sec = Base58decode(keyPair.secretKey);
    rawPub = Base58encode(pub);
    rawSec = Base58encode(sec);
  }));

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
    const sig = keyring.KeyGen(rawPub, rawSec).signSync(msg);
    const verified = keyring.verify(msg, sig, rawPub);
    verified.should.equal(true);
    done();
  });

  it('wrong signature from generated key should NOT be verified', function(done){
    const msg = "Some message to be signed";
    const cor = dec(enc(msg) + 'delta');
    const sig = keyring.KeyGen(rawPub, rawSec).signSync(msg);
    const verified = keyring.verify(cor, sig, rawPub);
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
    const verified = keyring.verify(msg, "u8t1IoWrB/C7T+2rS0rKYJfjPG4FN/HkKGFiUO5tILIzjFDvxxQiVC+0o/Vaz805SMmqJvXqornI71U7//+wCg==", "3AF7bhGQRt6ymcBZgZTBMoDsEtSwruSarjNG8kDnaueX");
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
    const verified = keyring.verify(msg, "ImvQDdpGv2M6CxSnBuseM/azJhBUGzWVgQhIvb5L2oGLm2GyLk/Sbi5wkb4IjbjbQfdRPdlcx5zxaHhvZCiWAA==", "Com8rJukCozHZyFao6AheSsfDQdPApxQRnz7QYFf64mm");
    verified.should.equal(true);
    done();
  });
});
