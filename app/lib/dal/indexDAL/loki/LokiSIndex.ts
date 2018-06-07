import {LokiIndex} from "./LokiIndex"
import {FullSindexEntry, Indexer, SindexEntry} from "../../../indexer"
import {SIndexDAO} from "../abstract/SIndexDAO"
import {Underscore} from "../../../common-libs/underscore"
import {MonitorLokiExecutionTime} from "../../../debug/MonitorLokiExecutionTime"

export class LokiSIndex extends LokiIndex<SindexEntry> implements SIndexDAO {

  constructor(loki:any) {
    super(loki, 'sindex', ['identifier', 'conditions', 'writtenOn'])
  }

  async findByIdentifierPosAmountBase(identifier: string, pos: number, amount: number, base: number): Promise<SindexEntry[]> {
    return this.collection
      .chain()
      .find({ identifier, pos, amount, base })
      .simplesort('writtenOn')
      .data()
      .map(src => {
        src.type = src.tx ? 'T' : 'D'
        return src
      })
  }

  async getAvailableForConditions(conditionsStr: string): Promise<SindexEntry[]> {
    const sources = this.collection
      .chain()
      .find({ conditions: { $regex: conditionsStr } })
      .simplesort('writtenOn')
      .data()
      .filter(s => this.collection.find({ identifier: s.identifier, pos: s.pos, consumed: true }).length === 0)
      .map(src => {
        src.type = src.tx ? 'T' : 'D'
        return src
      })
    return Underscore.sortBy(sources, (row:SindexEntry) => row.type == 'D' ? 0 : 1)
  }

  async getAvailableForPubkey(pubkey: string): Promise<{ amount: number; base: number }[]> {
    return this.collection
      .chain()
      .find({ conditions: { $regex: 'SIG\\(' + pubkey + '\\)' } })
      .simplesort('writtenOn')
      .data()
      .filter(s => this.collection.find({ identifier: s.identifier, pos: s.pos, consumed: true }).length === 0)
      .map(src => {
        src.type = src.tx ? 'T' : 'D'
        return src
      })
  }

  async getSource(identifier: string, pos: number): Promise<FullSindexEntry | null> {
    const reducables = this.collection
      .chain()
      .find({ identifier, pos })
      .simplesort('writtenOn')
      .data()
      .map(src => {
        src.type = src.tx ? 'T' : 'D'
        return src
      })
    if (reducables.length === 0) {
      return null
    }
    return Indexer.DUP_HELPERS.reduce(reducables)
  }

  async getUDSources(pubkey: string): Promise<FullSindexEntry[]> {
    const reducables = this.collection
      .chain()
      .find({
        $and: [
          { tx: null },
          { conditions: 'SIG(' + pubkey + ')' },
        ]
      })
      .simplesort('writtenOn')
      .data()
      .map(src => {
        src.type = src.tx ? 'T' : 'D'
        return src
      })
    return Indexer.DUP_HELPERS.reduceBy(reducables, ['identifier', 'pos'])
  }

  @MonitorLokiExecutionTime(true)
  async trimConsumedSource(belowNumber: number): Promise<void> {
    const consumed = this.collection
      .find({ writtenOn: { $lt: belowNumber }})
      .filter(s => s.consumed)
    for (const e of consumed) {
      this.collection
        .chain()
        .find({
          identifier: e.identifier,
          pos: e.pos
        })
        .remove()
    }
  }

  /**
   * For SINDEX, trimming records <=> removing the consumed sources.
   * @param {number} belowNumber Number below which a consumed source must be removed.
   * @returns {Promise<void>}
   */
  async trimRecords(belowNumber: number): Promise<void> {
    return this.trimConsumedSource(belowNumber)
  }


}
