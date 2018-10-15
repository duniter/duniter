import {FullIindexEntry, IindexEntry, Indexer} from "../../../indexer"
import {SQLiteDriver} from "../../drivers/SQLiteDriver"
import {MonitorExecutionTime} from "../../../debug/MonitorExecutionTime"
import {IIndexDAO} from "../abstract/IIndexDAO"
import {OldIindexEntry} from "../../../db/OldIindexEntry"
import {OldTransformers} from "../common/OldTransformer"
import {SqliteTable} from "./SqliteTable"
import {SqlNotNullableFieldDefinition, SqlNullableFieldDefinition} from "./SqlFieldDefinition"

export class SqliteIIndex extends SqliteTable<IindexEntry> implements IIndexDAO {

  constructor(getSqliteDB: (dbName: string)=> Promise<SQLiteDriver>) {
    super(
      'iindex',
      {
        'op':         new SqlNotNullableFieldDefinition('CHAR', false, 6),
        'pub':        new SqlNotNullableFieldDefinition('VARCHAR', true, 50),
        'written_on': new SqlNotNullableFieldDefinition('VARCHAR', false, 80),
        'writtenOn':  new SqlNotNullableFieldDefinition('INT', true),
        'created_on': new SqlNullableFieldDefinition('VARCHAR', false, 80),
        'uid':        new SqlNullableFieldDefinition('VARCHAR', true, 100),
        'hash':       new SqlNullableFieldDefinition('VARCHAR', false, 70),
        'sig':        new SqlNullableFieldDefinition('VARCHAR', false, 100),
        'member':     new SqlNullableFieldDefinition('BOOLEAN', true),
        'wasMember':  new SqlNullableFieldDefinition('BOOLEAN', true),
        'kick':       new SqlNullableFieldDefinition('BOOLEAN', true),
        'wotb_id':    new SqlNullableFieldDefinition('INT', true),
      },
      getSqliteDB
    )
  }

  /**
   * TECHNICAL
   */

  cleanCache(): void {
  }

  triggerInit(): void {
  }

  /**
   * INSERT
   */

  @MonitorExecutionTime()
  async insert(record: IindexEntry): Promise<void> {
    await this.insertInTable(this.driver, record)
  }

  @MonitorExecutionTime()
  async insertBatch(records: IindexEntry[]): Promise<void> {
    if (records.length) {
      return this.insertBatchInTable(this.driver, records)
    }
  }

  /**
   * DELETE
   */

  @MonitorExecutionTime()
  async removeBlock(blockstamp: string): Promise<void> {
    await this.driver.sqlWrite(`DELETE FROM iindex WHERE written_on = ?`, [blockstamp])
  }

  @MonitorExecutionTime()
  async trimRecords(belowNumber: number): Promise<void> {
    const belowRecords:IindexEntry[] = await this.driver.sqlRead('SELECT COUNT(*) as nbRecords, pub FROM iindex ' +
      'WHERE writtenOn < ? ' +
      'GROUP BY pub ' +
      'HAVING nbRecords > 1', [belowNumber])
    const reducedByPub = Indexer.DUP_HELPERS.reduceBy(belowRecords, ['pub']);
    for (const record of reducedByPub) {
      const recordsOfPub = await this.reducable(record.pub)
      const toReduce = recordsOfPub.filter(rec => parseInt(rec.written_on) < belowNumber)
      if (toReduce.length && recordsOfPub.length > 1) {
        // Clean the records in the DB
        await this.driver.sqlExec('DELETE FROM iindex WHERE pub = \'' + record.pub + '\'')
        const nonReduced = recordsOfPub.filter(rec => parseInt(rec.written_on) >= belowNumber)
        const reduced = Indexer.DUP_HELPERS.reduce(toReduce)
        // Persist
        await this.insertBatch([reduced].concat(nonReduced))
      }
    }
  }

  /**
   * FIND
   */

  @MonitorExecutionTime()
  async getWrittenOn(blockstamp: string): Promise<IindexEntry[]> {
    return this.find('SELECT * FROM iindex WHERE written_on = ?', [blockstamp])
  }

  @MonitorExecutionTime()
  async findRawWithOrder(criterion: { pub?: string }, sort: (string | (string | boolean)[])[]): Promise<IindexEntry[]> {
    let sql = `SELECT * FROM iindex ${criterion.pub ? 'WHERE pub = ?' : ''}`
    if (sort.length) {
      sql += ` ORDER BY ${sort.map(s => `${s[0]} ${s[1] ? 'DESC' : 'ASC'}`).join(', ')}`
    }
    return this.find(sql, criterion.pub ? [criterion.pub] : [])
  }

  private async find(sql: string, params: any[]): Promise<IindexEntry[]> {
    return this.findEntities(sql, params)
  }

  /**
   * OTHER
   */

  @MonitorExecutionTime()
  async reducable(pub: string): Promise<IindexEntry[]> {
    return this.find('SELECT * FROM iindex WHERE pub = ? order by writtenOn ASC', [pub])
  }

  //-----------------

  @MonitorExecutionTime()
  async findByPub(pub: string): Promise<IindexEntry[]> {
    return this.find('SELECT * FROM iindex WHERE pub = ? order by writtenOn ASC', [pub])
  }

  @MonitorExecutionTime()
  async findByUid(uid: string): Promise<IindexEntry[]> {
    return this.find('SELECT * FROM iindex WHERE uid = ? order by writtenOn ASC', [uid])
  }

  @MonitorExecutionTime()
  async getFromPubkey(pub: string): Promise<FullIindexEntry | null> {
    const entries = await this.find('SELECT * FROM iindex WHERE pub = ? order by writtenOn ASC', [pub])
    if (!entries.length) {
      return null
    }
    return OldTransformers.iindexEntityOrNull(entries) as any
  }

  // Non-protocol
  @MonitorExecutionTime()
  async getFromPubkeyOrUid(search: string): Promise<FullIindexEntry | null> {
    return Indexer.DUP_HELPERS.reduceOrNull((await this.find('SELECT * FROM iindex WHERE pub = ? OR uid = ?', [search, search])) as FullIindexEntry[])
  }

  @MonitorExecutionTime()
  async getFromUID(uid: string): Promise<FullIindexEntry | null> {
    const entries = await this.find('SELECT * FROM iindex WHERE uid = ? order by writtenOn ASC', [uid])
    if (!entries.length) {
      return null
    }
    return this.getFromPubkey(entries[0].pub) as any
  }

  @MonitorExecutionTime()
  async getFullFromHash(hash: string): Promise<FullIindexEntry> {
    const entries = await this.find('SELECT * FROM iindex WHERE hash = ? order by writtenOn ASC', [hash])
    if (!entries.length) {
      return null as any
    }
    return this.getFromPubkey(entries[0].pub) as any
  }

  @MonitorExecutionTime()
  async getFullFromPubkey(pub: string): Promise<FullIindexEntry> {
    return (await this.getFromPubkey(pub)) as FullIindexEntry
  }

  @MonitorExecutionTime()
  async getFullFromUID(uid: string): Promise<FullIindexEntry> {
    return (await this.getFromUID(uid)) as FullIindexEntry
  }

  @MonitorExecutionTime()
  async getMembers(): Promise<{ pubkey: string; uid: string | null }[]> {
    const members = await this.find('SELECT * FROM iindex i1 ' +
      'WHERE member AND NOT EXISTS (' +
      '  SELECT * FROM iindex i2 ' +
      '  WHERE i2.pub = i1.pub' +
      '  AND i2.writtenOn > i1.writtenOn' +
      '  AND NOT i2.member)', [])
    await Promise.all(members.map(async m => {
      if (!m.uid) {
        const withUID = await this.find('SELECT * FROM iindex WHERE pub = ? AND uid IS NOT NULL', [m.pub])
        m.uid = withUID[0].uid
      }
    }))
    return members.map(m => ({
      pubkey: m.pub,
      uid: m.uid
    }))
  }

  @MonitorExecutionTime()
  async getToBeKickedPubkeys(): Promise<string[]> {
    return (await this.find('SELECT * FROM iindex i1 ' +
      'WHERE kick AND NOT EXISTS (' +
      '  SELECT * FROM iindex i2 ' +
      '  WHERE i2.pub = i1.pub' +
      '  AND i2.writtenOn > i1.writtenOn)', [])).map(r => r.pub)
  }

  @MonitorExecutionTime()
  async searchThoseMatching(search: string): Promise<OldIindexEntry[]> {
    return (await this.find('SELECT * FROM iindex WHERE pub = ? OR uid = ?', [search, search]))
      .map(OldTransformers.toOldIindexEntry)
  }
}
