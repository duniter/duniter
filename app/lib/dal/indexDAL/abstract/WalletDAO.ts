import {Initiable} from "../../sqliteDAL/Initiable"
import {DBWallet} from "../../sqliteDAL/WalletDAL"

export interface WalletDAO extends Initiable {

  /**
   * Trigger the initialization of the DAO. Called when the underlying DB is ready.
   */
  triggerInit(): void

  /**
   * Saves a wallet.
   * @param {DBWallet} wallet
   * @returns {Promise<DBWallet>}
   */
  saveWallet(wallet:DBWallet): Promise<DBWallet>

  /**
   * Find a wallet based on conditions.
   * @param {string} conditions
   * @returns {Promise<DBWallet>}
   */
  getWallet(conditions:string): Promise<DBWallet>

  /**
   * Make a batch insert.
   * @param records The records to insert as a batch.
   */
  insertBatch(records:DBWallet[]): Promise<void>
}
