import {DividendEntry, UDSource} from "../abstract/DividendDAO"
import {SimpleUdEntryForWallet, SindexEntry} from "../../../indexer"

export class DividendDaoHandler {

  static getNewDividendEntry(pub: string): DividendEntry {
    return { pub, member: true, availables: [], dividends: [], consumed: [], consumedUDs: [] }
  }

  static produceDividend(r: DividendEntry, blockNumber: number, dividend: number, unitbase: number, dividends: SimpleUdEntryForWallet[] = []) {
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
  }

  static consume(m: DividendEntry, dividendToConsume: SindexEntry) {
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
  }

  static udSources(member: DividendEntry) {
    return member.availables.map(pos => this.toUDSource(member, pos) as UDSource)
  }

  private static toUDSource(entry: DividendEntry, pos: number): UDSource|null {
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

  static getUDSourceByIdPosAmountBase(member: DividendEntry|null, identifier: string, pos: number, amount: number, base: number) {
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

  static getUDSource(member: DividendEntry|null, identifier: string, pos: number) {
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

  static getWrittenOnUDs(m: DividendEntry, number: number, res: SimpleUdEntryForWallet[]) {
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
  }

  static removeDividendsProduced(m: DividendEntry, number: number, createdUDsDestroyedByRevert: SimpleUdEntryForWallet[]) {
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
  }

  static unconsumeDividends(m: DividendEntry, number: number, consumedUDsRecoveredByRevert: SimpleUdEntryForWallet[]) {
    let index;
    do {
      index = m.consumed.indexOf(number)

      if (index !== -1) {
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
      }
    } while (index !== -1);
  }

  static trimConsumed(m: DividendEntry, belowNumber: number) {
    let updated = false
    for (let i = 0; i < m.consumed.length; i++) {
      const consumedBlockNumber = m.consumed[i]
      if (consumedBlockNumber < belowNumber) {
        // We trim this entry as it can't be reverted now
        m.consumed.splice(i, 1)
        m.consumedUDs.splice(i, 1)
        i-- // The array changed, we loop back before i++
        updated = true
      }
    }
    return updated
  }

  static toDump(rows: DividendEntry[]) {
    const entries: SindexEntry[] = []
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
}
