import {Initiable} from "../../sqliteDAL/Initiable"
import {LokiDAO} from "../loki/LokiDAO"

export interface GenericDAO<T> extends Initiable, LokiDAO {

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
   * Make a generic find with some ordering.
   * @param criterion Criterion object, LokiJS's find object format.
   * @param sort A LokiJS's compunded sort object.
   * @returns {Promise<any>} A set of records.
   */
  findRawWithOrder(criterion: any, sort:((string|((string|boolean)[]))[])): Promise<T[]>

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
