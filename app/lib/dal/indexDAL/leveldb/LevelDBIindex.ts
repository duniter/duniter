import {MonitorExecutionTime} from "../../../debug/MonitorExecutionTime"
import {FullIindexEntry, IindexEntry, reduce, reduceForDBTrimming} from "../../../indexer"
import {LevelUp} from 'levelup'
import {LevelDBTable} from "./LevelDBTable"
import {Underscore} from "../../../common-libs/underscore"
import {pint} from "../../../common-libs/pint"
import {IIndexDAO} from "../abstract/IIndexDAO"
import {LevelIIndexHashIndexer} from "./indexers/LevelIIndexHashIndexer"
import {reduceConcat, reduceGroupBy} from "../../../common-libs/reduce"
import {LevelDBWrittenOnIndexer} from "./indexers/LevelDBWrittenOnIndexer"
import {OldIindexEntry} from "../../../db/OldIindexEntry"
import {LevelIIndexUidIndexer} from "./indexers/LevelIIndexUidIndexer"
import {LevelIIndexKickIndexer} from "./indexers/LevelIIndexKickIndexer"
import {DataErrors} from "../../../common-libs/errors"
import {OldTransformers} from "../common/OldTransformer"

export class LevelDBIindex extends LevelDBTable<IindexEntry[]> implements IIndexDAO {

  private indexForHash: LevelIIndexHashIndexer
  private indexForUid: LevelIIndexUidIndexer
  private indexForKick: LevelIIndexKickIndexer
  private indexForWrittenOn: LevelDBWrittenOnIndexer<IindexEntry>

  constructor(protected getLevelDB: (dbName: string)=> Promise<LevelUp>) {
    super('level_iindex', getLevelDB)
  }

  /**
   * TECHNICAL
   */

  async init(): Promise<void> {
    await super.init()
    this.indexForHash = new LevelIIndexHashIndexer('level_iindex/hash', this.getLevelDB)
    this.indexForUid = new LevelIIndexUidIndexer('level_iindex/uid', this.getLevelDB)
    this.indexForKick = new LevelIIndexKickIndexer('level_iindex/kick', this.getLevelDB)
    this.indexForWrittenOn = new LevelDBWrittenOnIndexer('level_iindex/writtenOn', this.getLevelDB, i => i.pub)
    await this.indexForHash.init()
    await this.indexForUid.init()
    await this.indexForKick.init()
    await this.indexForWrittenOn.init()
  }

  async close(): Promise<void> {
    await super.close()
    await this.indexForHash.close()
    await this.indexForUid.close()
    await this.indexForKick.close()
    await this.indexForWrittenOn.close()
  }

  /**
   * INSERT
   */

  @MonitorExecutionTime()
  async insert(record: IindexEntry): Promise<void> {
    await this.insertBatch([record])
  }

  @MonitorExecutionTime()
  async insertBatch(records: IindexEntry[]): Promise<void> {
    // Database insertion
    const recordsByPub = reduceGroupBy(records, 'pub')
    await Promise.all(Underscore.keys(recordsByPub).map(async pub => {
      const existing = (await this.getOrNull(pub)) || []
      await this.put(pub, existing.concat(recordsByPub[pub]))
    }))
    // Indexation
    await this.indexForHash.onInsert(records)
    await this.indexForUid.onInsert(records)
    await this.indexForKick.onInsert(records)
    await this.indexForWrittenOn.onInsert(records)
  }


  /**
   * Reduceable DAO
   */

  async trimRecords(belowNumber: number): Promise<void> {
    // Trim writtenOn: we remove from the index the blocks below `belowNumber`, and keep track of the deleted values
    const pubkeys: string[] = Underscore.uniq((await this.indexForWrittenOn.deleteBelow(belowNumber)))
    // For each entry, we trim the records of our INDEX
    await Promise.all(pubkeys.map(async pub => {
      const oldEntries = await this.get(pub)
      const newEntries = reduceForDBTrimming(oldEntries, belowNumber)
      await this.put(pub, newEntries)
    }))
    await this.indexForHash.onTrimming(belowNumber)
    await this.indexForUid.onTrimming(belowNumber)
    await this.indexForKick.onTrimming(belowNumber)
  }

  /**
   * Generic DAO
   */

  async findRawWithOrder(criterion: { pub?: string }, sort: (string | (string | boolean)[])[]): Promise<IindexEntry[]> {
    const rows: IindexEntry[] = (await this.findAllValues()).reduce(reduceConcat, [])
    return Underscore.sortBy(rows, r => `${String(r.writtenOn).padStart(10, '0')}-${String(r.wotb_id).padStart(10, '0')}`)
  }

  async getWrittenOn(blockstamp: string): Promise<IindexEntry[]> {
    const ids = (await this.indexForWrittenOn.getWrittenOnKeys(pint(blockstamp))) || []
    return (await Promise.all(ids.map(id => this.get(id)))).reduce(reduceConcat, []).filter(e => e.written_on === blockstamp)
  }

  async removeBlock(blockstamp: string): Promise<void> {
    // Trim writtenOn: we remove from the index the blocks below `belowNumber`, and keep track of the deleted values
    const writteOn = pint(blockstamp)
    const pubkeys: string[] = Underscore.uniq((await this.indexForWrittenOn.deleteAt(writteOn)))
    let removedRecords: IindexEntry[] = []
    // For each entry, we trim the records of our INDEX
    await Promise.all(pubkeys.map(async pub => {
      const records = await this.get(pub)
      const keptRecords = records.filter(e => e.written_on !== blockstamp)
      removedRecords = removedRecords.concat(records.filter(e => e.written_on === blockstamp))
      await this.put(pub, keptRecords)
    }))
    // Update indexes
    await this.indexForHash.onRemove(removedRecords)
    await this.indexForUid.onRemove(removedRecords)
    await this.indexForKick.onRemove(removedRecords)
  }

  async findByPub(pub: string): Promise<IindexEntry[]> {
    if (!pub) {
      return []
    }
    return (await this.getOrNull(pub)) || []
  }

  async findByUid(uid: string): Promise<IindexEntry[]> {
    const pub = await this.indexForUid.getPubByUid(uid)
    if (!pub) {
      return []
    }
    return this.get(pub)
  }

  async getFromPubkey(pub: string): Promise<FullIindexEntry | null> {
    const entries = (await this.getOrNull(pub)) || []
    if (!entries || entries.length === 0) {
      return null
    }
    return reduce(entries) as FullIindexEntry
  }

  async getFromPubkeyOrUid(search: string): Promise<FullIindexEntry | null> {
    const fromPub = await this.getFromPubkey(search)
    const fromUid = await this.getFromUID(search)
    return fromPub || fromUid
  }

  async getFromUID(uid: string): Promise<FullIindexEntry | null> {
    const pub = await this.indexForUid.getPubByUid(uid)
    if (!pub) {
      return null
    }
    const entries = (await this.getOrNull(pub)) || []
    if (!entries || entries.length === 0) {
      return null
    }
    return reduce(entries) as FullIindexEntry
  }

  async getFullFromHash(hash: string): Promise<FullIindexEntry|null> {
    const pub = await this.indexForHash.getByHash(hash) as string
    if (!pub) {
      return null
    }
    const entries = await this.get(pub)
    return OldTransformers.iindexEntityOrNull(entries) as Promise<FullIindexEntry>
  }

  async getFullFromPubkey(pub: string): Promise<FullIindexEntry> {
    const entries = await this.get(pub)
    return reduce(entries) as FullIindexEntry
  }

  async getFullFromUID(uid: string): Promise<FullIindexEntry> {
    const pub = await this.indexForUid.getPubByUid(uid)
    if (!pub) {
      throw Error(DataErrors[DataErrors.IDENTITY_UID_NOT_FOUND])
    }
    const entries = await this.get(pub)
    return reduce(entries) as FullIindexEntry
  }

  // Full scan
  async getMembers(): Promise<{ pubkey: string; uid: string | null }[]> {
    const members: IindexEntry[] = []
    await this.findWhere(e => {
      if (reduce(e).member as boolean) {
        members.push(e[0])
      }
      return false
    })
    return members.map(m => ({
      pubkey: m.pub,
      uid: m.uid
    }))
  }

  async getToBeKickedPubkeys(): Promise<string[]> {
    return this.indexForKick.getAll()
  }

  async reducable(pub: string): Promise<IindexEntry[]> {
    return this.findByPub(pub)
  }

  // Full scan
  async searchThoseMatching(search: string): Promise<OldIindexEntry[]> {
    const uidKeys = await this.indexForUid.findAllKeys()
    const pubKeys = await this.findAllKeys()
    const uids = (uidKeys).filter(u => u.includes(search))
    const pubs = (pubKeys).filter(p => p.includes(search))
    const uidIdentities = await Promise.all(uids.map(async uid => OldTransformers.toOldIindexEntry(reduce(await this.findByUid(uid)))))
    const pubIdentities = await Promise.all(pubs.map(async pub => OldTransformers.toOldIindexEntry(reduce(await this.findByPub(pub)))))
    return uidIdentities
      .filter(u => u.pub)
      .concat(
        pubIdentities
        .filter(p => p.pub)
      )
  }

}
