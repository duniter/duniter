"use strict";

import { Ed25519Signator, KeyPairBuilder, sha256, verify, generateRandomSeed, seedToSecretKey } from "../../neon/lib";
import * as assert from "assert";


let keyPair: Ed25519Signator, rawPub:string, rawSec:string

describe('ed25519 tests:', function(){

  before(async () => {
    // Generate the keypair
    keyPair = KeyPairBuilder.fromSecretKey('51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP');
    rawPub = keyPair.getPublicKey();
    //rawSec = keyPair.getSecretKey();
    assert.equal(rawPub, 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
    //assert.equal(rawSec, '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP');
  })

  it('sha256 hello', function(done){
    const msg = "hello";
    const hash = sha256(msg);
    assert.equal(hash, "2CF24DBA5FB0A30E26E83B2AC5B9E29E1B161E5C1FA7425E73043362938B9824")
    done();
  });

  it('good signature from generated key should be verified', function(done){
    const msg = "Some message to be signed";
    const sig = keyPair.sign(msg);
    const verified = verify(msg, sig, rawPub);
    assert.equal(verified, true)
    done();
  });

  it('wrong signature from generated key should NOT be verified', function(done){
    const msg = "Some message to be signed";
    const sig = keyPair.sign(msg);
    const verified = verify(msg + 'delta', sig, rawPub);
    assert.equal(verified, false)
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
    assert.equal(verified, true)
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
    assert.equal(verified, true)
    done();
  });

  it('wrong block signature due to oldest tweetnacl should NOT be verified with verify', function(done){
    const msg = "InnerHash: 8B194B5C38CF0A38D16256405AC3E5FA5C2ABD26BE4DCC0C7ED5CC9824E6155B\nNonce: 30400000119992\n";
    const rawSig = "fJusVDRJA8akPse/sv4uK8ekUuvTGj1OoKYVdMQQAACs7OawDfpsV6cEMPcXxrQTCTRMrTN/rRrl20hN5zC9DQ==";
    const verified = verify(msg, rawSig, "D9D2zaJoWYWveii1JRYLVK3J4Z7ZH3QczoKrnQeiM6mx");
    assert.equal(verified, false)
    done();
  });

  it('rectified block signature should be verified with verify', function(done){
    const msg = "InnerHash: 8B194B5C38CF0A38D16256405AC3E5FA5C2ABD26BE4DCC0C7ED5CC9824E6155B\nNonce: 30400000119992\n";
    const rawSig = "aZusVDRJA8akPse/sv4uK8ekUuvTGj1OoKYVdMQQ/3+VMaDJ02I795GBBaLgjypZFEKYlPMssJMn/X+F/pxgAw==";
    const verified = verify(msg, rawSig, "D9D2zaJoWYWveii1JRYLVK3J4Z7ZH3QczoKrnQeiM6mx");
    assert.equal(verified, true)
    done();
  });
  it('generate random keypair', function (done) {
    const seed = generateRandomSeed();
    const secretKey = seedToSecretKey(seed);
    const keyPair = KeyPairBuilder.fromSecretKey(secretKey);
    const msg = "Some message to be signed";
    const sig = keyPair.sign(msg);
    const verified = verify(msg, sig, keyPair.getPublicKey());
    assert.equal(verified, true)
    done();
  });
  it('membership: should not accept wrong signature', function(done){
    const msg = 'Version: 10\n' +
    'Type: Membership\n' +
    'Currency: bb\n' +
    'Issuer: 6upqFiJ66WV6N3bPc8x8y7rXT3syqKRmwnVyunCtEj7o\n' +
    'Block: 0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855\n' +
    'Membership: IN\n' +
    'UserID: someuid\n' +
    'CertTS: 0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855\n';
    const rawSig = "cJohoG/qmxm7KwqCB71RXRSIvHu7IcYB1zWE33OpPLGmedH mdPWad32S7G9j9IDpI8QpldalhdT4BUIHlAtCw==";
    const verified = verify(msg, rawSig, "6upqFiJ66WV6N3bPc8x8y7rXT3syqKRmwnVyunCtEj7o");
    assert.equal(verified, false)
    done();
  });
});

