import {Indexer} from "../../../indexer"
import {LokiIndex} from "./LokiIndex"
import {MonitorLokiExecutionTime} from "../../../debug/MonitorLokiExecutionTime"

export class LokiPubkeySharingIndex<T extends { written_on:string, writtenOn:number, pub:string }> extends LokiIndex<T> {

  @MonitorLokiExecutionTime(true)
  async trimRecords(belowNumber: number): Promise<void> {
    // TODO: may be optimized by only selecting new offseted records
    const criterion:any = {
      writtenOn: {
        $lt: belowNumber
      }
    }
    const trimmable = await this.collection
      .chain()
      .find(criterion)
      .simplesort('writtenOn')
      .data()
    const trimmableByPub: { [pub:string]: T[] } = {}
    for (const t of trimmable) {
      if (!trimmableByPub[t.pub]) {
        trimmableByPub[t.pub] = []
      }
      trimmableByPub[t.pub].push(t)
    }
    for (const pub of Object.keys(trimmableByPub)) {
      if (trimmableByPub[pub].length > 1) {
        // Remove the existing records
        for (const t of trimmableByPub[pub]) {
          this.collection.remove(t)
        }
        // Insert a new one that gathers them
        const reduced = Indexer.DUP_HELPERS.reduce(trimmableByPub[pub])
        this.collection.insert(reduced)
      }
    }
  }
}
