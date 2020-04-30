/* tslint:disable */

export class KeyPairBuilder {

    static fromSeed(seed: Buffer): Ed25519Signator;

    static fromSecretKey(secretKey: string): Ed25519Signator;

    static random(): Ed25519Signator;
}

export class Ed25519Signator {

    getPublicKey(): string;

    sign(message: Buffer | string): string;
}

export function generateRandomSeed(): Buffer;
export function seedToSecretKey(seed: Buffer): string;
export function sha256(data: string): string;
export function verify(message: Buffer | string, sig: string, pubkey: string): boolean;
