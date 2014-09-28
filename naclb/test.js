var addon  = require('bindings')('nacl');
var nacl   = require('tweetnacl');
var base58 = require('../app/lib/base58');

var rawPub = "HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd";
var rawMsg = "UID:CAT\nMETA:TS:1411321474\n";
var rawSig = "YvMQqaOAgLtnJzg5ZGhI17sZvXjGgzpSMxNz8ikttMspU5/45MQAqnOfuJnfbrzkkspGlUUjDnUPsOmHPcVyBQ==";

var msg = nacl.util.decodeUTF8(rawMsg);
var sig = nacl.util.decodeBase64(rawSig);
var pub = base58.decode(rawPub);

const crypto_sign_BYTES = 64;
// checkArrayTypes(msg, sig, publicKey);
// if (sig.length !== crypto_sign_BYTES)
//   throw new Error('bad signature size');
// if (publicKey.length !== crypto_sign_PUBLICKEYBYTES)
//   throw new Error('bad public key size');
var start = new Date();
var sm = new Uint8Array(crypto_sign_BYTES + msg.length);
var m = new Uint8Array(crypto_sign_BYTES + msg.length);
var i;
for (i = 0; i < crypto_sign_BYTES; i++) sm[i] = sig[i];
for (i = 0; i < msg.length; i++) sm[i+crypto_sign_BYTES] = msg[i];
// return (crypto_sign_open(m, sm, sm.length, publicKey) >= 0);
var end = new Date();
// console.log(end.getTime() - start.getTime());

// console.log(dMsg);
// console.log(dSig);
// console.log(dPub);

console.log(addon.nacl(m, sm, pub));
