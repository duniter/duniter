import {FullSindexEntry, Indexer, SimpleTxEntryForWallet, SindexEntry} from "../../../indexer"
import {SIndexDAO} from "../abstract/SIndexDAO"
import {Underscore} from "../../../common-libs/underscore"
import {MonitorLokiExecutionTime} from "../../../debug/MonitorLokiExecutionTime"
import {LokiProtocolIndex} from "./LokiProtocolIndex"
import {LokiDividend} from "./LokiDividend"

export class LokiSIndex extends LokiProtocolIndex<SindexEntry> implements SIndexDAO {

  private lokiDividend: LokiDividend

  constructor(loki:any) {
    super(loki, 'sindex', ['identifier', 'conditions', 'writtenOn'])
    this.lokiDividend = new LokiDividend(loki)
  }

  async findTxSourceByIdentifierPosAmountBase(identifier: string, pos: number, amount: number, base: number): Promise<SindexEntry[]> {
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
      .find({ conditions: conditionsStr })
      .simplesort('writtenOn')
      .data()
      .filter(s => this.collection.find({ identifier: s.identifier, pos: s.pos, consumed: true }).length === 0)
      .map(src => {
        src.type = src.tx ? 'T' : 'D'
        return src
      })
    return Underscore.sortBy(sources, (row:SindexEntry) => row.type == 'D' ? 0 : 1)
  }

  async getAvailableForPubkey(pubkey: string): Promise<{ amount: number; base: number, conditions: string, identifier: string, pos: number }[]> {
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

  async getTxSource(identifier: string, pos: number): Promise<FullSindexEntry | null> {
    const reducables = this.collection
      .chain()
      .find({ identifier, pos })
      .compoundsort([['writtenOn', false], ['op', false]])
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

  async getWrittenOnTxs(blockstamp: string): Promise<SimpleTxEntryForWallet[]> {
    const entries = (await this.getWrittenOn(blockstamp))
    const res: SimpleTxEntryForWallet[] = []
    entries.forEach(s => {
      res.push({
        srcType: 'T',
        op: s.op,
        conditions: s.conditions,
        amount: s.amount,
        base: s.base,
        identifier: s.identifier,
        pos: s.pos
      })
    })
    return res
  }
}
