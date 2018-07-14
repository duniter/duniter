import {GenericDAO} from "../abstract/GenericDAO"
import {LokiCollectionManager} from "./LokiCollectionManager"
import {MonitorLokiExecutionTime} from "../../../debug/MonitorLokiExecutionTime"

export abstract class LokiIndex<T> extends LokiCollectionManager<T> implements GenericDAO<T> {

  cleanCache(): void {
  }

  async insert(record: T): Promise<void> {
    this.collection.insert(record)
  }

  @MonitorLokiExecutionTime(true)
  async findRaw(criterion?:any) {
    return this.collection.find(criterion)
  }

  @MonitorLokiExecutionTime(true)
  async findRawWithOrder(criterion:any, sort:((string|((string|boolean)[]))[])) {
    const res = this.collection
      .chain()
      .find(criterion)
      .compoundsort(sort)
    return res.data()
  }

  @MonitorLokiExecutionTime()
  async insertBatch(records: T[]): Promise<void> {
    records.map(r => this.insert(r))
  }

  abstract getWrittenOn(blockstamp: string): Promise<T[]>
  abstract removeBlock(blockstamp: string): Promise<void>
}
