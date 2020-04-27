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

export class DetailedDistance {
    nbSentries: number;
    nbSuccess: number;
    nbSuccessAtBorder: number;
    nbReached: number;
    nbReachedAtBorder: number;
    isOutdistanced: number;
}

export class WotBuilder {
    static fromWot(wot: Wot): Wot;

    static fromFile(filePath: string): Wot;
}

export class Wot {
    constructor(maxCert: number);

    clear(): void;

    getMaxCert(): number;

    setMaxCert(maxCert: number): void;

    addNode(): number;

    removeNode(): number;

    getWoTSize(): number;

    isEnabled(node_id: number): boolean;

    getEnabled(): number[];

    setEnabled(enabled: boolean, node_id: number): boolean;

    getDisabled(): number[];

    getSentries(sentry_requirement: number): number[];

    getNonSentries(sentry_requirement: number): number[];

    addLink(source: number, target: number): number;

    existsLink(source: number, target: number): boolean;

    removeLink(source: number, target: number): number;

    isOutdistanced(
        node_id: number,
        sentry_requirement: number,
        step_max: number,
        x_percent: number
    ): boolean;

    detailedDistance(
        nde_id: number,
        sentry_requirement: number,
        step_max: number,
        x_percent: number
    ): DetailedDistance;

    getPaths(source: number, target: number, step_max: number): number[][];

    writeInFile(file_path: string): boolean;

    dump(): string;
}
