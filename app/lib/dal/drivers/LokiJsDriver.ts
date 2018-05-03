import {LokiFsAdapter} from "./LokiFsAdapter"
import {MemFS, RealFS} from "../../system/directory"

const loki = require('lokijs')

export class LokiJsDriver {

  private readonly lokiInstance:any
  private adapter: LokiFsAdapter

  constructor(
    private dbFilePath:string = ''
  ) {
    this.adapter = new LokiFsAdapter(dbFilePath, dbFilePath ? RealFS() : MemFS())
    this.lokiInstance = new loki(dbFilePath + '/loki.db' || 'mem' + Date.now() + '.db', {
      adapter: this.adapter
    })
  }

  async loadDatabase() {
    // We load only non-memory DB
    if (this.dbFilePath) {
      await this.adapter.loadDatabase(this.lokiInstance)
    }
  }

  getLokiInstance() {
    return this.lokiInstance
  }

  async commitData() {
    return this.adapter.flush(this.lokiInstance)
  }

  async flushAndTrimData() {
    return this.adapter.dbDump(this.lokiInstance)
  }
}
