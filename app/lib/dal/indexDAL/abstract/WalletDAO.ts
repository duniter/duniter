import { Initiable } from "../../sqliteDAL/Initiable";
import { DBWallet } from "../../../db/DBWallet";

export interface WalletDAO extends Initiable {
  /**
   * Saves a wallet.
   * @param {DBWallet} wallet
   * @returns {Promise<DBWallet>}
   */
  saveWallet(wallet: DBWallet): Promise<DBWallet>;

  /**
   * Find a wallet based on conditions.
   * @param {string} conditions
   * @returns {Promise<DBWallet>}
   */
  getWallet(conditions: string): Promise<DBWallet | null>;

  /**
   * Make a batch insert.
   * @param records The records to insert as a batch.
   */
  insertBatch(records: DBWallet[]): Promise<void>;

  /**
   * Lists all the wallets.
   * @returns {Promise<DBWallet[]>}
   */
  listAll(): Promise<DBWallet[]>;
}
