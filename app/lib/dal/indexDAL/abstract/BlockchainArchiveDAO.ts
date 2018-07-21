import {Initiable} from "../../sqliteDAL/Initiable"
import {DBBlock} from "../../../db/DBBlock"

export interface BlockLike {
  number:number
  hash:string
  previousHash:string
}

export interface BlockchainArchiveDAO<T extends BlockLike> extends Initiable {

  /**
   * Trigger the initialization of the DAO. Called when the underlying DB is ready.
   */
  triggerInit(): void

  /**
   * Retrieves a block from the archives.
   * @param {number} number Block number.
   * @param {string} hash Block hash.
   * @returns {Promise<DBBlock>}
   */
  getBlock(number:number, hash:string): Promise<T|null>

  /**
   * Retrieves a block from the archives, without checking the hash.
   * @param {number} number Block number.
   * @returns {Promise<DBBlock>}
   */
  getBlockByNumber(number:number): Promise<T|null>

  /**
   * Get the blocks whose number is between [start ; end].
   * @param {number} start Starting number to be included.
   * @param {number} end Ending number to be included.
   * @returns {Promise<T[]>} The corresponding blocks.
   */
  getBlocks(start: number, end: number): Promise<T[]>

  /**
   * Archives a suite of blocks.
   *
   * Throws an exception is blocks does not follow each other, or does not follow previously archived blocks.
   * @param {DBBlock[]} records The blocks to archive.
   * @returns {Promise<void>}
   */
  archive(records:T[]): Promise<number>

  /**
   * Retrieve the last block (maximum number) that was archived.
   * @returns {Promise<BlockLike | null>}
   */
  getLastSavedBlock(): Promise<T|null>

  readonly chunkSize:number
}
