import {Initiable} from "../../sqliteDAL/Initiable"

export interface GenericDAO<T> extends Initiable {

  /**
   * Trigger the initialization of the DAO. Called when the underlying DB is ready.
   */
  triggerInit(): void

  /**
   * Make a generic find.
   * @param criterion Criterion object, LokiJS's find object format.
   * @returns {Promise<any>} A set of records.
   */
  findRaw(criterion: any): Promise<any>

  /**
   * Make a single insert.
   * @param record The record to insert.
   */
  insert(record:T): Promise<void>

  /**
   * Make a batch insert.
   * @param records The records to insert as a batch.
   */
  insertBatch(records:T[]): Promise<void>

  /**
   * Get the set of records written on a particular blockstamp.
   * @param {string} blockstamp The blockstamp we want the records written at.
   * @returns {Promise<T[]>} The records (array).
   */
  getWrittenOn(blockstamp:string): Promise<T[]>

  /**
   * Remove all entries written at given `blockstamp`, if these entries are still in the index.
   * @param {string} blockstamp Blockstamp of the entries we want to remove.
   * @returns {Promise<void>}
   */
  removeBlock(blockstamp:string): Promise<void>
}
