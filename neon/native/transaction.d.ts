/* tslint:disable */

export class TransactionDTOV10 {
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
}

export function rawTxParseAndVerify(raw: string, currency?: string): TransactionDTOV10;
export function sourceIsUnlockable(
    currentBcTime: number,
    txIssuers: string[],
    proofs: string, 
    sourceWrittenOn: number,
    utxoScript: string
): boolean;
export function txVerify(tx: TransactionDTOV10, currency?: string): void;
export function txsInputsAreUnlockable(currentBcTime: number, inputsConditions: string[], inputsWrittenOn: number[], tx: TransactionDTOV10): boolean;
