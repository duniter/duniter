"use strict";
const should = require('should');
const co  = require('co');
const nacl   = require('tweetnacl');
const keyring      = require('../../../../app/common/lib/crypto/keyring');

const enc = nacl.util.encodeBase64,
    dec = nacl.util.decodeBase64;

let key;

describe('Random keypair', function(){

  before(() => co(function*() {
    // Generate the keypair
    key = keyring.randomKey()
  }));

  it('good signature from generated key should be verified', function(done){
    const msg = "Some message to be signed";
    const sig = keyring.Key(key.publicKey, key.secretKey).signSync(msg);
    const verified = keyring.verify(msg, sig, key.publicKey);
    verified.should.equal(true);
    done();
  });

  it('wrong signature from generated key should NOT be verified', function(done){
    const msg = "Some message to be signed";
    const cor = dec(enc(msg) + 'delta');
    const sig = keyring.Key(key.publicKey, key.secretKey).signSync(msg);
    const verified = keyring.verify(cor, sig, key.publicKey);
    verified.should.equal(false);
    done();
  });
});
