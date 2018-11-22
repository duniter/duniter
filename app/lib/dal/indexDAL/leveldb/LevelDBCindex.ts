import {MonitorExecutionTime} from "../../../debug/MonitorExecutionTime"
import {CindexEntry, FullCindexEntry, Indexer, reduceBy} from "../../../indexer"
import {LevelUp} from 'levelup'
import {LevelDBTable} from "./LevelDBTable"
import {Underscore} from "../../../common-libs/underscore"
import {pint} from "../../../common-libs/pint"
import {CIndexDAO} from "../abstract/CIndexDAO"
import {reduceConcat} from "../../../common-libs/reduce"
import {AbstractIteratorOptions} from "abstract-leveldown"

export interface LevelDBCindexEntry {
  received: string[]
  issued: CindexEntry[]
}

export class LevelDBCindex extends LevelDBTable<LevelDBCindexEntry> implements CIndexDAO {

  private indexForExpiresOn: LevelDBTable<string[]>
  private indexForWrittenOn: LevelDBTable<string[]>

  constructor(protected getLevelDB: (dbName: string)=> Promise<LevelUp>) {
    super('level_cindex', getLevelDB)
  }

  /**
   * TECHNICAL
   */

  async init(): Promise<void> {
    await super.init()
    this.indexForExpiresOn = new LevelDBTable<string[]>('level_cindex/expiresOn', this.getLevelDB)
    this.indexForWrittenOn = new LevelDBTable<string[]>('level_cindex/writtenOn', this.getLevelDB)
    await this.indexForExpiresOn.init()
    await this.indexForWrittenOn.init()
  }

  async close(): Promise<void> {
    await super.close()
    await this.indexForExpiresOn.close()
    await this.indexForWrittenOn.close()
  }

  /**
   * INSERT
   */

  @MonitorExecutionTime()
  async insert(record: CindexEntry): Promise<void> {
    await this.insertBatch([record])
  }

  @MonitorExecutionTime()
  async insertBatch(records: CindexEntry[]): Promise<void> {
    for (const r of records) {
      const existingIssuer = await this.getOrNull(r.issuer)
      const existingReceiver = await this.getOrNull(r.receiver)
      let newValue4Issuer = existingIssuer || {
        received: [],
        issued: []
      }
      let newValue4Receiver = existingReceiver || {
        received: [],
        issued: []
      }
      newValue4Issuer.issued.push(r)
      if (!newValue4Receiver.received.includes(r.issuer) && r.op === 'CREATE') {
        newValue4Receiver.received.push(r.issuer)
      }
      await Promise.all([
        this.put(r.issuer, newValue4Issuer),
        this.put(r.receiver, newValue4Receiver)
      ])
    }
    await this.indexRecords(records)
  }


  /**
   * Reduceable DAO
   */

  async trimRecords(belowNumber: number): Promise<void> {
    // Trim writtenOn: we remove from the index the blocks below `belowNumber`, and keep track of the deleted values
    let issuers: string[] = Underscore.uniq((await this.indexForWrittenOn.deleteWhere({ lt: LevelDBCindex.trimWrittenOnKey(belowNumber) }))
      .map(kv => kv.value)
      .reduce(reduceConcat, []))
    // Trim expired certs that won't be rolled back + we remember the max value of expired_on that was trimmed
    let maxExpired = 0
    issuers = Underscore.uniq(issuers)
    await Promise.all(issuers.map(async issuer => {
      const entry = await this.get(issuer)
      const fullEntries = reduceBy(entry.issued, ['issuer', 'receiver'])
      const toRemove: string[] = []
      // We remember the maximum value of expired_on, for efficient trimming  search
      fullEntries
        .filter(f => f.expired_on && f.writtenOn < belowNumber)
        .forEach(f => {
          maxExpired = Math.max(maxExpired, f.expired_on)
          toRemove.push(LevelDBCindex.trimFullKey(f.issuer, f.receiver, f.created_on))
        })
      if (toRemove.length) {
        // Trim the expired certs that won't be rolled back ever
        entry.issued = entry.issued.filter(entry => !toRemove.includes(LevelDBCindex.trimFullKey(entry.issuer, entry.receiver, entry.created_on)))
        await this.put(issuer, entry)
      }
    }))
    // Finally, we trim the expiredOn index
    await this.indexForExpiresOn.deleteWhere({ lte: LevelDBCindex.trimExpiredOnKey(maxExpired) })
  }

  /**
   * Generic DAO
   */

  async findRawWithOrder(criterion: { pub?: string }, sort: (string | (string | boolean)[])[]): Promise<CindexEntry[]> {
    const rows: CindexEntry[] = (await this.findAllValues()).map(r => r.issued).reduce(reduceConcat, [])
    return Underscore.sortBy(rows, r => LevelDBCindex.trimDumpSortKey(r.written_on, r.issuer, r.receiver))
  }

  async getWrittenOn(blockstamp: string): Promise<CindexEntry[]> {
    const ids = (await this.indexForWrittenOn.getOrNull(LevelDBCindex.trimWrittenOnKey(pint(blockstamp)))) || []
    return (await Promise.all(ids.map(async id => (await this.get(id)).issued))).reduce(reduceConcat, []).filter(e => e.written_on === blockstamp)
  }

  async removeBlock(blockstamp: string): Promise<void> {
    const writtenOn = pint(blockstamp)
    const issuers = (await this.indexForWrittenOn.getOrNull(LevelDBCindex.trimWrittenOnKey(writtenOn))) || []
    const toRemove: CindexEntry[] = []
    for (const issuer of issuers) {
      // Remove the entries
      const entry = await this.get(issuer)
      const previousLength = entry.issued.length
      entry.issued = entry.issued.filter(e => {
        const shouldBeDeleted = e.written_on === blockstamp
        if (shouldBeDeleted) {
          toRemove.push(e)
        }
        return !shouldBeDeleted
      })
      if (entry.issued.length !== previousLength) {
        // Update the entry
        await this.put(issuer, entry)
      }
    }
    // Remove the "received" arrays
    await Promise.all(toRemove.map(async e => {
      const entry = await this.get(e.receiver)
      // Remove the certification
      entry.received = entry.received.filter(issuer => issuer !== e.issuer)
      // Persist
      await this.put(e.receiver, entry)
    }))
    // Remove the expires_on index entries
    const expires = Underscore.uniq(toRemove.filter(e => e.expires_on).map(e => e.expires_on))
    await Promise.all(expires.map(async e => this.indexForExpiresOn.del(LevelDBCindex.trimExpiredOnKey(e))))
  }

  private static trimExpiredOnKey(writtenOn: number) {
    return String(writtenOn).padStart(10, '0')
  }

  private static trimWrittenOnKey(writtenOn: number) {
    return String(writtenOn).padStart(10, '0')
  }

  private static trimFullKey(issuer: string, receiver: string, created_on: number) {
    return `${issuer}-${receiver}-${String(created_on).padStart(10, '0')}`
  }

  private static trimDumpSortKey(written_on: string, issuer: string, receiver: string) {
    return `${written_on.padStart(100, '0')}-${issuer}-${receiver}`
  }

  private async indexRecords(records: CindexEntry[]) {
    const byExpiresOn: { [k: number]: CindexEntry[] } = {}
    const byWrittenOn: { [k: number]: CindexEntry[] } = {}
    records
      .filter(r => r.expires_on)
      .forEach(r => (byExpiresOn[r.expires_on] || (byExpiresOn[r.expires_on] = [])).push(r))
    records
      .forEach(r => (byWrittenOn[r.writtenOn] || (byWrittenOn[r.writtenOn] = [])).push(r))
    // Index expires_on => issuers
    for (const k of Underscore.keys(byExpiresOn)) {
      const issuers: string[] = ((await this.indexForExpiresOn.getOrNull(LevelDBCindex.trimExpiredOnKey(k))) || [])
        .concat(byExpiresOn[k].map(r => r.issuer))
      await this.indexForExpiresOn.put(LevelDBCindex.trimExpiredOnKey(k), issuers)
    }
    // Index writtenOn => issuers
    for (const k of Underscore.keys(byWrittenOn)) {
      await this.indexForWrittenOn.put(LevelDBCindex.trimWrittenOnKey(k), byWrittenOn[k].map(r => r.issuer))
    }
  }

  async existsNonReplayableLink(issuer: string, receiver: string, medianTime: number, version: number): Promise<boolean> {
    const entries = await this.findByIssuer(issuer)
    const reduced = Indexer.DUP_HELPERS.reduceBy(entries, ['issuer', 'receiver'])
    return reduced.filter(e => e.receiver === receiver && (version <= 10 || e.replayable_on >= medianTime)).length > 0
  }

  async findByIssuer(issuer: string): Promise<CindexEntry[]> {
    return (await this.getOrNull(issuer) || { issued: [], received: [] }).issued
  }

  async findByIssuerAndChainableOnGt(issuer: string, medianTime: number): Promise<CindexEntry[]> {
    return (await this.findByIssuer(issuer)).filter(e => e.chainable_on > medianTime)
  }

  async findByIssuerAndReceiver(issuer: string, receiver: string): Promise<CindexEntry[]> {
    return (await this.findByIssuer(issuer)).filter(e => e.receiver === receiver)
  }

  async findByReceiverAndExpiredOn(pub: string, expired_on: number): Promise<CindexEntry[]> {
    const receiver = (await this.getOrNull(pub)) || { issued: [], received: [] }
    const issuers = receiver.received
    return (await Promise.all(issuers.map(async issuer => {
      return (await this.get(issuer)).issued.filter(e => e.receiver === pub && e.expired_on === 0)
    }))).reduce(reduceConcat, [])
  }

  async findExpiresOnLteNotExpiredYet(medianTime: number): Promise<CindexEntry[]> {
    const issuers: string[] = Underscore.uniq((await this.indexForExpiresOn.findAllValues({ lte: LevelDBCindex.trimExpiredOnKey(medianTime) })).reduce(reduceConcat, []))
    return (await Promise.all(issuers.map(async issuer => {
      const fullEntries = Indexer.DUP_HELPERS.reduceBy((await this.get(issuer)).issued, ['issuer', 'receiver'])
      return fullEntries.filter(e => e.expires_on <= medianTime && !e.expired_on)
    }))).reduce(reduceConcat, [])
  }

  async getReceiversAbove(minsig: number): Promise<string[]> {
    return this.findWhereTransform(i => i.received.length >= minsig, i => i.key)
  }

  async getValidLinksFrom(issuer: string): Promise<CindexEntry[]> {
    const fullEntries = Indexer.DUP_HELPERS.reduceBy(((await this.getOrNull(issuer)) || { issued: [] }).issued, ['issuer', 'receiver'])
    return fullEntries.filter(e => !e.expired_on)
  }

  async getValidLinksTo(receiver: string): Promise<CindexEntry[]> {
    const issuers: string[] = ((await this.getOrNull(receiver)) || { issued: [], received: [] }).received
    return (await Promise.all(issuers.map(async issuer => {
      const fullEntries = Indexer.DUP_HELPERS.reduceBy((await this.get(issuer)).issued, ['issuer', 'receiver'])
      return fullEntries.filter(e => e.receiver === receiver && !e.expired_on)
    }))).reduce(reduceConcat, [])
  }

  async reducablesFrom(from: string): Promise<FullCindexEntry[]> {
    const entries = ((await this.getOrNull(from)) || { issued: [], received: [] }).issued
    return Indexer.DUP_HELPERS.reduceBy(entries, ['issuer', 'receiver'])
  }

  trimExpiredCerts(belowNumber: number): Promise<void> {
    return this.trimRecords(belowNumber)
  }

  async count(options?: AbstractIteratorOptions): Promise<number> {
    let count = 0
    await this.readAllKeyValue(entry => {
      count += entry.value.issued.length
    })
    return count
  }
}
