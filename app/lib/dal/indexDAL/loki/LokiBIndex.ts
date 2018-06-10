import {DBHead} from "../../../db/DBHead"
import {BIndexDAO} from "../abstract/BIndexDAO"
import {NewLogger} from "../../../logger"
import {getDurationInMicroSeconds, getMicrosecondsTime} from "../../../../ProcessCpuProfiler"
import {MonitorLokiExecutionTime} from "../../../debug/MonitorLokiExecutionTime"
import {LokiProtocolIndex} from "./LokiProtocolIndex"

const logger = NewLogger()

export class LokiBIndex extends LokiProtocolIndex<DBHead> implements BIndexDAO {

  private HEAD:DBHead|null = null

  constructor(loki:any) {
    super(loki, 'bindex', ['number', 'hash'])
  }

  async insert(record: DBHead): Promise<void> {
    this.HEAD = record
    return super.insert(record);
  }

  async removeBlock(blockstamp: string): Promise<void> {
    this.HEAD = await this.head(2)
    return super.removeBlock(blockstamp);
  }

  async head(n: number): Promise<DBHead> {
    if (!n) {
      throw "Cannot read HEAD~0, which is the incoming block"
    }
    if (n === 1 && this.HEAD) {
      // Cached
      return this.HEAD
    } else if (this.HEAD) {
      // Another than HEAD
      return this.collection
        .find({ number: this.HEAD.number - n + 1 })[0]
    } else {
      // Costly method, as a fallback
      return this.collection
        .chain()
        .find({})
        .simplesort('number', true)
        .data()[n - 1]
    }
  }

  async range(n: number, m: number): Promise<DBHead[]> {
    if (!n) {
      throw "Cannot read HEAD~0, which is the incoming block"
    }
    const HEAD = await this.head(1)
    if (!HEAD) {
      return []
    }
    return this.collection
      .chain()
      .find({
        $and: [
          { number: { $lte: HEAD.number - n + 1 } },
          { number: { $gte: HEAD.number - m + 1 } },
        ]
      })
      .simplesort('number', true)
      .data().slice(n - 1, m)
  }

  async tail(): Promise<DBHead> {
    const HEAD = await this.head(1)
    if (!HEAD) {
      return HEAD
    }
    const nbHEADs = this.collection.length()
    return this.collection
      .find({ number: HEAD.number - nbHEADs + 1 })[0]
  }

  @MonitorLokiExecutionTime(true)
  async trimBlocks(maxnumber: number): Promise<void> {
    this.collection
      .chain()
      .find({ number: { $lt: maxnumber }})
      .remove()
  }

  @MonitorLokiExecutionTime(true)
  async getWrittenOn(blockstamp: string): Promise<DBHead[]> {
    const criterion:any = { number: parseInt(blockstamp) }
    return this.collection.find(criterion)
  }
}
