import {AbstractSQLite, BeforeSaveHook} from "./AbstractSQLite";
import {SQLiteDriver} from "../drivers/SQLiteDriver";
import {IndexEntry, Indexer} from "../../indexer";

const _ = require('underscore');

export class AbstractIndex<T extends IndexEntry> extends AbstractSQLite<T> {

  constructor(
    driver:SQLiteDriver,
    table: string,
    pkFields: string[] = [],
    fields: string[] = [],
    arrays: string[] = [],
    booleans: string[] = [],
    bigintegers: string[] = [],
    transientFields: string[] = [],
    beforeSaveHook: BeforeSaveHook<T> | null = null
  ) {
    super(driver, table, pkFields, fields, arrays, booleans, bigintegers, transientFields, beforeSaveHook)
  }

  public async init() {}

  getWrittenOn(blockstamp:string) {
    return this.query('SELECT * FROM ' + this.table + ' WHERE written_on = ?', [blockstamp])
  }

  async trimRecords(belowNumber:number) {
    const belowRecords:T[] = await this.query('SELECT COUNT(*) as nbRecords, pub FROM ' + this.table + ' ' +
      'WHERE CAST(written_on as int) < ? ' +
      'GROUP BY pub ' +
      'HAVING nbRecords > 1', [belowNumber]);
    const reducedByPub = Indexer.DUP_HELPERS.reduceBy(belowRecords, ['pub']);
    for (const record of reducedByPub) {
      const recordsOfPub = await this.query('SELECT * FROM ' + this.table + ' WHERE pub = ?', [record.pub]);
      const toReduce = _.filter(recordsOfPub, (rec:T) => parseInt(rec.written_on) < belowNumber);
      if (toReduce.length) {
        // Clean the records in the DB
        await this.exec('DELETE FROM ' + this.table + ' WHERE pub = \'' + record.pub + '\'');
        const nonReduced = _.filter(recordsOfPub, (rec:T) => parseInt(rec.written_on) >= belowNumber);
        const reduced = Indexer.DUP_HELPERS.reduce(toReduce);
        // Persist
        await this.insertBatch([reduced].concat(nonReduced));
      }
    }
  }
}
