import {LokiIndex} from "./LokiIndex"
import {DividendDAO, DividendEntry, UDSource} from "../abstract/DividendDAO"
import {
  IindexEntry,
  SimpleSindexEntryForWallet,
  SimpleTxEntryForWallet,
  SimpleTxInput,
  SimpleUdEntryForWallet,
  SindexEntry
} from "../../../indexer"
import {DataErrors} from "../../../common-libs/errors"

export class LokiDividend extends LokiIndex<DividendEntry> implements DividendDAO {

  // private lokiDividend:

  constructor(loki:any) {
    super(loki, 'dividend', ['pub'])
  }

  async createMember(pub: string): Promise<void> {
    const existing = this.collection.find({ pub })[0]
    if (!existing) {
      await this.insert({ pub, member: true, availables: [], dividends: [], consumed: [], consumedUDs: [] })
    } else {
      await this.setMember(true, pub)
    }
  }

  async setMember(member: boolean, pub: string) {
    await this.collection
      .chain()
      .find({ pub })
      .update(r => {
        r.member = member
      })
  }

  async deleteMember(pub: string): Promise<void> {
    this.collection
      .chain()
      .find({ pub })
      .remove()
  }

  async produceDividend(blockNumber: number, dividend: number, unitbase: number, local_iindex: IindexEntry[]): Promise<SimpleUdEntryForWallet[]> {
    const dividends: SimpleUdEntryForWallet[] = []
    // Then produce the UD
    this.collection
      .chain()
      .find({ member: true })
      .update(r => {
        r.availables.push(blockNumber)
        r.dividends.push({ amount: dividend, base: unitbase })
        dividends.push({
          srcType: 'D',
          amount: dividend,
          base: unitbase,
          conditions: 'SIG(' + r.pub + ')',
          op: 'CREATE',
          identifier: r.pub,
          pos: blockNumber
        })
      })
    return dividends
  }

  async consume(filter: SindexEntry[]): Promise<void> {
    for (const dividendToConsume of filter) {
      this.collection
        .chain()
        .find({
          pub: dividendToConsume.identifier
        })
        .update(m => {
          const index = m.availables.indexOf(dividendToConsume.pos)

          // We add it to the consumption history
          m.consumed.push(dividendToConsume.writtenOn)
          m.consumedUDs.push({
            dividendNumber: dividendToConsume.pos,
            dividend: m.dividends[index]
          })

          // We remove it from available dividends
          m.availables.splice(index, 1)
          m.dividends.splice(index, 1)
        })
    }
  }

  async getUDSources(pub: string): Promise<UDSource[]> {
    const member = this.collection
      .chain()
      .find({ pub })
      .data()[0]
    if (!member) {
      return []
    }
    return member.availables.map(pos => this.toUDSource(member, pos) as UDSource)
  }

  async findUdSourceByIdentifierPosAmountBase(identifier: string, pos: number, amount: number, base: number): Promise<SimpleTxInput[]> {
    const member = this.collection.find({ pub: identifier })[0]
    let src: UDSource|null = null
    if (member) {
      const udSrc = this.toUDSource(member, pos)
      if (udSrc && udSrc.amount === amount && udSrc.base === base) {
        src = udSrc
      }
    }
    return [{
      written_time: 0,
      conditions: 'SIG(' + identifier + ')',
      consumed: !src,
      amount,
      base
    }]
  }

  private toUDSource(entry: DividendEntry, pos: number): UDSource|null {
    const index = entry.availables.indexOf(pos)
    if (index === -1) {
      return null
    }
    const src = entry.dividends[index]
    return {
      consumed: false,
      pos,
      amount: src.amount,
      base: src.base,
    }
  }

  async getUDSource(identifier: string, pos: number): Promise<SimpleTxInput|null> {
    const member = this.collection.find({ pub: identifier })[0]
    let src: UDSource|null = null
    if (member) {
      src = this.toUDSource(member, pos)
    }
    if (!src) {
      return null
    }
    return {
      written_time: 0,
      conditions: 'SIG(' + identifier + ')',
      consumed: !src,
      amount: src.amount,
      base: src.base
    }
  }

  async getWrittenOn(blockstamp: string): Promise<DividendEntry[]> {
    throw Error(DataErrors[DataErrors.LOKI_DIVIDEND_GET_WRITTEN_ON_SHOULD_NOT_BE_USED])
  }

  async getWrittenOnUDs(number: number): Promise<SimpleUdEntryForWallet[]> {
    const res: SimpleUdEntryForWallet[] = []
    this.collection
      .chain()
      .find({ availables: { $contains: number } })
      .data()
      .map(m => {
        const s = this.toUDSource(m, number) as UDSource
        res.push({
          srcType: 'D',
          op: 'CREATE',
          conditions: 'SIG(' + m.pub + ')',
          amount: s.amount,
          base: s.base,
          identifier: m.pub,
          pos: s.pos
        })
      })
    return res
  }

  async removeBlock(blockstamp: string): Promise<void> {
    throw Error(DataErrors[DataErrors.LOKI_DIVIDEND_REMOVE_BLOCK_SHOULD_NOT_BE_USED])
  }

  /**
   * Remove UD data produced in a block, either UD production or UD consumption.
   * @param {number} number Block number to revert the created UDs.
   * @returns {Promise<{createdUDsDestroyedByRevert: SimpleUdEntryForWallet[]}>}
   */
  async revertUDs(number: number): Promise<{
    createdUDsDestroyedByRevert: SimpleUdEntryForWallet[]
    consumedUDsRecoveredByRevert: SimpleUdEntryForWallet[]
  }> {
    const createdUDsDestroyedByRevert: SimpleUdEntryForWallet[] = []
    const consumedUDsRecoveredByRevert: SimpleUdEntryForWallet[] = []
    // Remove produced dividends at this block
    this.collection
      .chain()
      .find({ availables: { $contains: number }})
      .update(m => {
        const index = m.availables.indexOf(number)
        const src = m.dividends[index]
        createdUDsDestroyedByRevert.push({
          conditions: 'SIG(' + m.pub + ')',
          pos: number,
          identifier: m.pub,
          amount: src.amount,
          base: src.base,
          srcType: 'D',
          op: 'CREATE'
        })
        m.availables.splice(index, 1)
        m.dividends.splice(index, 1)
      })
    // Unconsumed dividends consumed at this block
    this.collection
      .chain()
      .find({ consumed: { $contains: number }})
      .update(m => {
        const index = m.consumed.indexOf(number)

        const src = m.consumedUDs[index].dividend
        consumedUDsRecoveredByRevert.push({
          conditions: 'SIG(' + m.pub + ')',
          pos: m.consumedUDs[index].dividendNumber,
          identifier: m.pub,
          amount: src.amount,
          base: src.base,
          srcType: 'D',
          op: 'CREATE'
        })

        // We put it back as available
        m.availables.push(m.consumedUDs[index].dividendNumber)
        m.dividends.push(m.consumedUDs[index].dividend)

        // We remove it from consumed
        m.consumed.splice(index, 1)
        m.consumedUDs.splice(index, 1)
      })
    return {
      createdUDsDestroyedByRevert,
      consumedUDsRecoveredByRevert,
    }
  }
}
