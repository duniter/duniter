import {LokiCollection} from "./LokiTypes"
import {LokiProxyCollection} from "./LokiCollection"
import {NewLogger} from "../../../logger"

const logger = NewLogger()

export abstract class LokiCollectionManager<T> {

  protected collection:LokiCollection<T>
  protected collectionIsInitialized: Promise<void>
  protected resolveCollection: () => void

  public constructor(
    protected loki:any,
    protected collectionName:'iindex'|'mindex'|'cindex'|'sindex'|'bindex'|'blockchain'|'txs'|'wallet'|'peer',
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
}