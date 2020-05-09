/* tslint:disable */

export class DetailedDistance {
    nbSentries: number;
    nbSuccess: number;
    nbSuccessAtBorder: number;
    nbReached: number;
    nbReachedAtBorder: number;
    isOutdistanced: number;
}

export class Wot {
    constructor(maxCertOrFilePathOrBytes: number | string | Buffer);

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

    toBytes(): Buffer;

    dump(): string;
}
