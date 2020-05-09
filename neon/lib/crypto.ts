
import { Ed25519Signator, generateRandomSeed } from "../native";

export class KeyPairBuilder {

    static fromSeed(seed: Buffer): Ed25519Signator {
        return new Ed25519Signator(seed);
    }

    static fromSecretKey(secretKey: string): Ed25519Signator {
        return new Ed25519Signator(secretKey);
    }

    static random(): Ed25519Signator {
        return new Ed25519Signator(generateRandomSeed());
    }
}
