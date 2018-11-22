import {GenericDAO} from "../abstract/GenericDAO"
import {MonitorLokiExecutionTime} from "../../../debug/MonitorLokiExecutionTime"
import {LokiIndex} from "./LokiIndex"

export interface IndexData {
  written_on: string
  writtenOn: number
}

export abstract class LokiProtocolIndex<T extends IndexData> extends LokiIndex<T> implements GenericDAO<T> {

  @MonitorLokiExecutionTime(true)
  async getWrittenOn(blockstamp: string): Promise<T[]> {
    const criterion:any = { writtenOn: parseInt(blockstamp) }
    return this.collection.find(criterion)
  }

  @MonitorLokiExecutionTime(true)
  async removeBlock(blockstamp: string): Promise<void> {
    const data = await this.getWrittenOn(blockstamp)
    data.map(d => this.collection.remove(d))
  }

  async count() {
    return this.collection.data.length
  }
}
