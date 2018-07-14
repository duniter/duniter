import {LokiIndex} from "./LokiIndex"
import {DividendDAO, DividendEntry, UDSource} from "../abstract/DividendDAO"
import {IindexEntry, SimpleTxInput, SimpleUdEntryForWallet, SindexEntry} from "../../../indexer"
import {DataErrors} from "../../../common-libs/errors"

export class LokiDividend extends LokiIndex<DividendEntry> implements DividendDAO {

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
        // We look at the dividends of this member
        .find({
          pub: dividendToConsume.identifier
        })
        // Then we try to consume the dividend being spent
        .update(m => {
          const index = m.availables.indexOf(dividendToConsume.pos)

          // We add it to the consumption history
          m.consumed.push(dividendToConsume.writtenOn) // `writtenOn` is the date (block#) of consumption
          m.consumedUDs.push({
            dividendNumber: dividendToConsume.pos,
            dividend: m.dividends[index],
            txCreatedOn: dividendToConsume.created_on as string,
            txLocktime: dividendToConsume.locktime,
            txHash: dividendToConsume.tx as string,
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

  async findForDump(criterion: any): Promise<SindexEntry[]> {
    const entries: SindexEntry[] = []
    const rows = await this.findRaw(criterion)
    for (const m of rows) {
      // Generate for unspent UDs
      for (let i = 0; i < m.availables.length; i++) {
        const writtenOn = m.availables[i]
        const ud = m.dividends[i]
        entries.push({
          op: 'CREATE',
          index: 'SINDEX',
          srcType: 'D',
          tx: null,
          identifier: m.pub,
          writtenOn,
          pos: writtenOn,
          created_on: 'NULL', // TODO
          written_on: writtenOn + '', // TODO
          written_time: 0, // TODO
          amount: ud.amount,
          base: ud.base,
          locktime: null as any,
          consumed: false,
          conditions: 'SIG(' + m.pub + ')',
          unlock: null,
          txObj: null as any, // TODO
          age: 0,
        })
      }
      // Generate for spent UDs
      for (let i = 0; i < m.consumed.length; i++) {
        const writtenOn = m.consumed[i]
        const ud = m.consumedUDs[i]
        entries.push({
          op: 'CREATE',
          index: 'SINDEX',
          srcType: 'D',
          tx: null,
          identifier: m.pub,
          writtenOn: ud.dividendNumber,
          pos: ud.dividendNumber,
          created_on: 'NULL', // TODO
          written_on: writtenOn + '', // TODO
          written_time: 0, // TODO
          amount: ud.dividend.amount,
          base: ud.dividend.base,
          locktime: null as any,
          consumed: false,
          conditions: 'SIG(' + m.pub + ')',
          unlock: null,
          txObj: null as any, // TODO
          age: 0,
        })
        entries.push({
          op: 'UPDATE',
          index: 'SINDEX',
          srcType: 'D',
          tx: ud.txHash,
          identifier: m.pub,
          writtenOn,
          pos: ud.dividendNumber,
          created_on: ud.txCreatedOn,
          written_on: writtenOn + '', // TODO
          written_time: 0, // TODO
          amount: ud.dividend.amount,
          base: ud.dividend.base,
          locktime: ud.txLocktime,
          consumed: true,
          conditions: 'SIG(' + m.pub + ')',
          unlock: null,
          txObj: null as any, // TODO
          age: 0,
        })
      }
    }
    return entries
  }

  async trimConsumedUDs(belowNumber: number): Promise<void> {
    // Remove dividends consumed before `belowNumber`
    this.collection
      .chain()
      .find({})
      .update(m => {
        for (let i = 0; i < m.consumed.length; i++) {
          const consumedBlockNumber = m.consumed[i]
          if (consumedBlockNumber < belowNumber) {
            // We trim this entry as it can't be reverted now
            m.consumed.splice(i, 1)
            m.consumedUDs.splice(i, 1)
            i-- // The array changed, we loop back before i++
          }
        }
      })
  }
}
