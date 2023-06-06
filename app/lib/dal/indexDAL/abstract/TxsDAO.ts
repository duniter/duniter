import { GenericDAO } from "./GenericDAO";
import { TransactionDTO } from "../../../dto/TransactionDTO";
import { SandBox } from "../../sqliteDAL/SandBox";
import { DBTx } from "../../../db/DBTx";

export interface TxsDAO extends GenericDAO<DBTx> {
  disableCheckConstraints(): Promise<void>;

  enableCheckConstraints(): Promise<void>;

  trimExpiredNonWrittenTxs(limitTime: number): Promise<void>;

  getAllPending(versionMin: number): Promise<DBTx[]>;

  getTX(hash: string): Promise<DBTx>;

  /**
   * Make a batch insert or update.
   * @param records The records to insert or update as a batch.
   */
  saveBatch(records: DBTx[]): Promise<void>;

  addLinked(
    tx: TransactionDTO,
    block_number: number,
    time: number
  ): Promise<DBTx>;

  addPending(dbTx: DBTx): Promise<DBTx>;

  getTxHistoryByPubkey(
    pubkey: string
  ): Promise<{
    sent: DBTx[];
    received: DBTx[];
    sending: DBTx[];
    pending: DBTx[];
  }>;

  getTxHistoryByPubkeyBetweenBlocks(
    pubkey: string,
    from: number,
    to: number
  ): Promise<{ sent: DBTx[]; received: DBTx[] }>;

  getTxHistoryByPubkeyBetweenTimes(
    pubkey: string,
    from: number,
    to: number
  ): Promise<{ sent: DBTx[]; received: DBTx[] }>;

  getTxHistoryMempool(
    pubkey: string
  ): Promise<{ sending: DBTx[]; pending: DBTx[] }>;

  getLinkedWithIssuer(pubkey: string): Promise<DBTx[]>;

  getLinkedWithRecipient(pubkey: string): Promise<DBTx[]>;

  getPendingWithIssuer(pubkey: string): Promise<DBTx[]>;

  getPendingWithRecipient(pubkey: string): Promise<DBTx[]>;

  removeByHash(hash: string): Promise<void>;

  removeByHashBatch(hashArray: string[]): Promise<void>;

  removeAll(): Promise<void>;

  sandbox: SandBox<{
    issuers: string[];
    output_base: number;
    output_amount: number;
  }>;

  getSandboxRoom(): Promise<number>;

  setSandboxSize(size: number): void;
}
