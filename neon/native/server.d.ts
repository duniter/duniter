/* tslint:disable */

import { TransactionDTOV10 } from './transaction';

export class RustServerConf {
    command: string | null
    currency: string
    gva: GvaConf | undefined
    selfPubkey: string | null
    txsMempoolSize: number
}

export class GvaConf {
    host?: string
    port?: number
    path?: string;
    subscriptionsPath?: string;
}

export class PeerCard {
    version: number
    currency: string
    pubkey: string
    blockstamp: string
    endpoints: string[]
    signature: string
    status: string
}

export class RustDbTx {
    version: number;
    currency: string;
    locktime: number;
    hash: string;
    blockstamp: string;
    blockstampTime: number;
    issuers: string[];
    inputs: string[];
    outputs: string[];
    unlocks: string[];
    signatures: string[];
    comment: string;
    writtenBlockNumber: number;
    writtenTime: number;
}

export class TxsHistory {
    sent: RustDbTx[];
    received: RustDbTx[];
    sending: TransactionDTOV10[];
    pending: TransactionDTOV10[];
}

export class BlockDTOV10 {
    version: number;
    number: number;
    currency: string;
    hash: string;
    inner_hash: string;
    previousHash: string;
    issuer: string;
    previousIssuer: string;
    dividend: number | null;
    time: number;
    powMin: number;
    unitbase: number;
    membersCount: number;
    issuersCount: number;
    issuersFrame: number;
    issuersFrameVar: number;
    identities: string[];
    joiners: string[];
    actives: string[];
    leavers: string[];
    revoked: string[];
    excluded: string[];
    certifications: string[];
    transactions: TransactionDTOV10[];
    medianTime: number;
    nonce: number;
    parameters: string | null;
    signature: string;
    monetaryMass: number;
}

export class RustServer {
    constructor(conf: RustServerConf, home: string | null);

    acceptNewTx(tx: TransactionDTOV10, serverPubkey: string): boolean;
    addPendingTx(tx: TransactionDTOV10): void;
    getMempoolTxsFreeRooms(): number;
    getNewPendingTxs(): TransactionDTOV10[];
    getTransactionsHistory(pubkey: string): TxsHistory;
    getTransactionsPending(versionMin: number, medianTime: number): TransactionDTOV10[];
    getTxByHash(hash: string): TransactionDTOV10 | null;
    removeAllPendingTxs(): void;
    removePendingTxByHash(hash: string): void;
    revertBlock(block: BlockDTOV10): void;
    applyBlock(block: BlockDTOV10): void;
    applyChunkOfBlocks(blocks: BlockDTOV10[]): void;
    trimExpiredNonWrittenTxs(limitTime: number): void;
    updateSelfPeer(peer: PeerCard): void;
}
