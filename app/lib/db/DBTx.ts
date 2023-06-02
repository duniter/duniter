import { TransactionDTO } from "../dto/TransactionDTO";

export class DBTx {
  hash: string;
  block_number: number | null;
  locktime: number;
  version: number;
  currency: string;
  comment: string;
  blockstamp: string;
  blockstampTime: number | null;
  time: number | null;
  inputs: string[];
  unlocks: string[];
  outputs: string[];
  issuers: string[];
  signatures: string[];
  recipients: string[];
  written: boolean;
  removed: boolean;
  received: number;
  output_base: number;
  output_amount: number;
  written_on: string;
  writtenOn: number;

  issuer: string | null; // Computed
  recipient: string | null; // Computed

  static fromTransactionDTO(tx: TransactionDTO) {
    const dbTx = new DBTx();
    dbTx.hash = tx.hash;
    dbTx.locktime = tx.locktime;
    dbTx.version = tx.version;
    dbTx.currency = tx.currency;
    dbTx.blockstamp = tx.blockstamp;
    dbTx.blockstampTime = tx.blockstampTime;
    dbTx.comment = tx.comment || "";
    dbTx.inputs = tx.inputs;
    dbTx.unlocks = tx.unlocks;
    dbTx.outputs = tx.outputs;
    dbTx.issuers = tx.issuers;
    dbTx.signatures = tx.signatures;
    dbTx.recipients = tx.outputsAsRecipients();
    dbTx.written = false;
    dbTx.removed = false;
    dbTx.output_base = tx.output_base;
    dbTx.output_amount = tx.output_amount;

    // Computed columns (unique issuer and/or recipient)
    dbTx.issuer = (dbTx.issuers.length === 1) ? dbTx.issuers[0] : null;
    const recipients = !dbTx.issuer ? dbTx.recipients : dbTx.recipients.filter(r => r !== dbTx.issuer);
    dbTx.recipient = (recipients.length === 1) ? recipients[0] : null;

    return dbTx;
  }

}
