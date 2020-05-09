/* tslint:disable */

export class Ed25519Signator {

    constructor(seedOrSecretKey: Buffer | string);

    getPublicKey(): string;

    sign(message: Buffer | string): string;
}

export function generateRandomSeed(): Buffer;
export function seedToSecretKey(seed: Buffer): string;
export function sha256(data: string): string;
export function verify(message: Buffer | string, sig: string, pubkey: string): boolean;
