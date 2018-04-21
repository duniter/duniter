import {LokiCollection} from "./LokiTypes"
import {IindexEntry} from "../../../indexer"
import {CIndexDAO} from "../abstract/CIndexDAO"
import {ReduceableDAO} from "../abstract/ReduceableDAO"
import {Initiable} from "../../sqliteDAL/Initiable"
import {GenericDAO} from "../abstract/GenericDAO"
import {NewLogger} from "../../../logger"
import {LokiProxyCollection} from "./LokiCollection"

const logger = NewLogger()

export interface IndexData {
  written_on: string
  writtenOn: number
}

export abstract class LokiIndex<T extends IndexData> implements GenericDAO<T> {

  protected collection:LokiCollection<T>

  public constructor(
    protected loki:any,
    protected collectionName:'iindex'|'mindex'|'cindex'|'sindex'|'bindex',
    indices: (keyof T)[]) {
    const coll = loki.addCollection(collectionName, { indices })
    this.collection = new LokiProxyCollection(coll, collectionName)
  }

  async init(): Promise<void> {
  }

  cleanCache(): void {
  }

  async insert(record: T): Promise<void> {
    const now = Date.now()
    this.collection.insert(record)
    // logger.trace('[loki][%s][insert] %sms', this.collectionName, (Date.now() - now), JSON.stringify(record, null, ' '))
  }

  async findRaw(criterion?:any) {
    const now = Date.now()
    const res = this.collection.find(criterion)
    logger.trace('[loki][%s][findRaw] %sms', this.collectionName, (Date.now() - now), criterion)
    return res
  }

  async insertBatch(records: T[]): Promise<void> {
    const now = Date.now()
    records.map(r => this.insert(r))
    if (records.length) {
      logger.trace('[loki][%s][insertBatch] %s record(s) in %sms', this.collectionName, records.length, (Date.now() - now))
    }
  }

  async getWrittenOn(blockstamp: string): Promise<T[]> {
    const now = Date.now()
    const criterion:any = { writtenOn: parseInt(blockstamp) }
    const res = this.collection.find(criterion)
    logger.trace('[loki][%s][getWrittenOn] %sms', this.collectionName, (Date.now() - now), blockstamp)
    return res
  }

  async removeBlock(blockstamp: string): Promise<void> {
    const now = Date.now()
    const data = await this.getWrittenOn(blockstamp)
    data.map(d => this.collection.remove(d))
    logger.trace('[loki][%s][removeBlock] %sms', this.collectionName, (Date.now() - now), blockstamp)
  }
}
