import {LokiCollection} from "./LokiTypes"
import {GenericDAO} from "../abstract/GenericDAO"
import {NewLogger} from "../../../logger"
import {LokiProxyCollection} from "./LokiCollection"
import {getMicrosecondsTime} from "../../../../ProcessCpuProfiler"

const logger = NewLogger()

export interface IndexData {
  written_on: string
  writtenOn: number
}

export abstract class LokiIndex<T extends IndexData> implements GenericDAO<T> {

  protected collection:LokiCollection<T>
  protected collectionIsInitialized: Promise<void>
  private resolveCollection: () => void

  public constructor(
    protected loki:any,
    protected collectionName:'iindex'|'mindex'|'cindex'|'sindex'|'bindex'|'blockchain'|'txs',
    protected indices: (keyof T)[]) {
    this.collectionIsInitialized = new Promise<void>(res => this.resolveCollection = res)
  }

  public triggerInit() {
    const coll = this.loki.addCollection(this.collectionName, {
      indices: this.indices,
      disableChangesApi: false
    })
    this.collection = new LokiProxyCollection(coll, this.collectionName)
    this.resolveCollection()
  }

  async init(): Promise<void> {
    await this.collectionIsInitialized
    logger.info('Collection %s ready', this.collectionName)
  }

  cleanCache(): void {
  }

  async insert(record: T): Promise<void> {
    const now = getMicrosecondsTime()
    this.collection.insert(record)
    // logger.trace('[loki][%s][insert] %sµs', this.collectionName, (getMicrosecondsTime() - now))
  }

  async findRaw(criterion?:any) {
    const now = getMicrosecondsTime()
    const res = this.collection.find(criterion)
    logger.trace('[loki][%s][findRaw] => %sµs', this.collectionName, (getMicrosecondsTime() - now), criterion)
    return res
  }

  async insertBatch(records: T[]): Promise<void> {
    const now = getMicrosecondsTime()
    records.map(r => this.insert(r))
    if (records.length) {
      logger.trace('[loki][%s][insertBatch] %s record(s) in %sµs', this.collectionName, records.length, getMicrosecondsTime() - now)
    }
  }

  async getWrittenOn(blockstamp: string): Promise<T[]> {
    const now = getMicrosecondsTime()
    const criterion:any = { writtenOn: parseInt(blockstamp) }
    const res = this.collection.find(criterion)
    logger.trace('[loki][%s][getWrittenOn] %sµs', this.collectionName, (getMicrosecondsTime() - now), blockstamp)
    return res
  }

  async removeBlock(blockstamp: string): Promise<void> {
    const now = getMicrosecondsTime()
    const data = await this.getWrittenOn(blockstamp)
    data.map(d => this.collection.remove(d))
    logger.trace('[loki][%s][removeBlock] %sµs', this.collectionName, (getMicrosecondsTime() - now), blockstamp)
  }
}
