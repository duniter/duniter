const addon = require('../native/index.node');

const { Ed25519Signator, generateRandomSeed, seedToSecretKey, sha256, verify } = addon;

class KeyPairBuilder {

    static fromSeed(seed) {
        return new Ed25519Signator(seed);
    }

    static fromSecretKey(secretKey) {
        return new Ed25519Signator(secretKey);
    }

    static random() {
        return addon.generateRandomSeed();
    }
}

module.exports = { Ed25519Signator, KeyPairBuilder, generateRandomSeed, seedToSecretKey, sha256, verify };
