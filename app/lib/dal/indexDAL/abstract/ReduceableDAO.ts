import {GenericDAO} from "./GenericDAO"

export interface ReduceableDAO<T> extends GenericDAO<T> {

  /**
   * Reduce all records sharing a same reduction key that written before given block number.
   * @param {number} belowNumber All records written strictly under `belowNumber` have to be reduced on the reduction key.
   * @returns {Promise<void>}
   */
  trimRecords(belowNumber:number): Promise<void>
}
