import {FullMindexEntry, Indexer, MindexEntry} from "../../../indexer"
import {SQLiteDriver} from "../../drivers/SQLiteDriver"
import {MIndexDAO} from "../abstract/MIndexDAO"
import {MonitorExecutionTime} from "../../../debug/MonitorExecutionTime"
import {SqliteNodeIOManager} from "./SqliteNodeIOManager"
import {CommonConstants} from "../../../common-libs/constants"
import {SqliteTable} from "./SqliteTable"
import {SqlNotNullableFieldDefinition, SqlNullableFieldDefinition} from "./SqlFieldDefinition"

export class SqliteMIndex extends SqliteTable<MindexEntry> implements MIndexDAO {

  private readonly p2: Promise<SQLiteDriver>
  private d2: SqliteNodeIOManager<{
    pub: string,
    created_on: string,
    expires_on: number | null,
    expired_on: number | null,
    revokes_on: number | null,
    writtenOn: number,
  }>

  constructor(getSqliteDB: (dbName: string)=> Promise<SQLiteDriver>) {
    super(
      'mindex',
      {
        'op':           new SqlNotNullableFieldDefinition('CHAR', false, 6),
        'pub':          new SqlNotNullableFieldDefinition('VARCHAR', true, 50),
        'written_on':   new SqlNotNullableFieldDefinition('VARCHAR', true, 80),
        'writtenOn':    new SqlNotNullableFieldDefinition('INT', true),
        'created_on':   new SqlNotNullableFieldDefinition('VARCHAR', true, 80),
        'expires_on':   new SqlNullableFieldDefinition('INT', true),
        'expired_on':   new SqlNullableFieldDefinition('INT', false),
        'revocation':   new SqlNullableFieldDefinition('VARCHAR', false, 100),
        'revokes_on':   new SqlNullableFieldDefinition('INT', true),
        'chainable_on': new SqlNullableFieldDefinition('INT', true),
        'revoked_on':   new SqlNullableFieldDefinition('VARCHAR', true, 80),
        'leaving':      new SqlNullableFieldDefinition('BOOLEAN', false),
      },
      getSqliteDB
    )
    this.p2 = getSqliteDB('c_mindex.db')
  }

  /**
   * TECHNICAL
   */

  cleanCache(): void {
  }

  async init(): Promise<void> {
    await super.init()
    this.d2 = new SqliteNodeIOManager(await this.p2, 'c_mindex')
    // COMPUTED
    await this.d2.sqlExec(`
    BEGIN;
    CREATE TABLE IF NOT EXISTS c_mindex (
      pub VARCHAR(50) NOT NULL,
      created_on VARCHAR(80) NOT NULL,
      expires_on INT NULL,
      expired_on INT NULL,
      revokes_on INT NULL,
      writtenOn INT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_c_mindex_pub ON c_mindex (pub);
    CREATE INDEX IF NOT EXISTS idx_c_mindex_expires_on ON c_mindex (expires_on);
    CREATE INDEX IF NOT EXISTS idx_c_mindex_expired_on ON c_mindex (expired_on);
    CREATE INDEX IF NOT EXISTS idx_c_mindex_revokes_on ON c_mindex (revokes_on);
    CREATE INDEX IF NOT EXISTS idx_c_mindex_writtenOn ON c_mindex (writtenOn);
    COMMIT;
    `)
  }

  triggerInit(): void {
  }

  /**
   * INSERT
   */

  @MonitorExecutionTime()
  async insert(record: MindexEntry): Promise<void> {
    await this.insertInTable(this.driver, record)
  }

  @MonitorExecutionTime()
  async insertBatch(records: MindexEntry[]): Promise<void> {
    if (records.length) {
      await this.insertBatchInTable(this.driver, records)
      // Computed
      const cCreates = records.filter(r => r.op === CommonConstants.IDX_CREATE).map(r => `(
        '${r.pub}',
        '${r.created_on}',
        ${r.expires_on || null},
        ${r.expired_on},
        ${r.revokes_on || null},
        ${r.writtenOn}
      )`).join(',')
      if (cCreates) {
        await this.insertD2(cCreates)
      }
      records
        .filter(r => r.op === CommonConstants.IDX_UPDATE)
        .forEach(async (r) => {
          if (r.expires_on || r.expired_on || r.revokes_on) {
            await this.updateD2(r)
          }
        })
    }
  }

  @MonitorExecutionTime()
  async insertD2(cCreates: string) {
    const req = `INSERT INTO c_mindex (
        pub,
        created_on,
        expires_on,
        expired_on,
        revokes_on,
        writtenOn
        ) VALUES ${cCreates}`
    await this.d2.sqlWrite(req, [])
  }

  @MonitorExecutionTime()
  async updateD2(r: MindexEntry) {
    const req = `UPDATE c_mindex SET
          ${r.created_on ? `created_on = '${r.created_on}',` : ''}
          ${r.expires_on ? `expires_on = ${r.expires_on},` : ''}
          ${r.expired_on ? `expired_on = ${r.expired_on},` : ''}
          ${r.revokes_on ? `revokes_on = ${r.revokes_on},` : ''}
          writtenOn = ${r.writtenOn}
          WHERE pub = ?`
    await this.d2.sqlWrite(req, [r.pub])
  }

  /**
   * DELETE
   */

  @MonitorExecutionTime()
  async removeBlock(blockstamp: string): Promise<void> {
    await this.driver.sqlWrite(`DELETE FROM mindex WHERE written_on = ?`, [blockstamp])
  }

  @MonitorExecutionTime()
  async trimRecords(belowNumber: number): Promise<void> {
    const belowRecords:MindexEntry[] = await this.driver.sqlRead('SELECT COUNT(*) as nbRecords, pub FROM mindex ' +
      'WHERE writtenOn < ? ' +
      'GROUP BY pub ' +
      'HAVING nbRecords > 1', [belowNumber])
    const reducedByPub = Indexer.DUP_HELPERS.reduceBy(belowRecords, ['pub']);
    for (const record of reducedByPub) {
      const recordsOfPub = await this.reducable(record.pub)
      const toReduce = recordsOfPub.filter(rec => parseInt(rec.written_on) < belowNumber)
      if (toReduce.length && recordsOfPub.length > 1) {
        // Clean the records in the DB
        await this.driver.sqlExec('DELETE FROM mindex WHERE pub = \'' + record.pub + '\'')
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
  async findByPubAndChainableOnGt(pub: string, medianTime: number): Promise<MindexEntry[]> {
    return this.find('SELECT * FROM mindex WHERE pub = ? AND chainable_on > ?', [pub, medianTime])
  }

  @MonitorExecutionTime()
  async findPubkeysThatShouldExpire(medianTime: number): Promise<{ pub: string, created_on: string }[]> {
    return this.find('SELECT *, (' +
      // Le dernier renouvellement
      '  SELECT m2.expires_on ' +
      '  FROM mindex m2 ' +
      '  WHERE m2.pub = m1.pub ' +
      '  AND m2.writtenOn = (' +
      '    SELECT MAX(m4.writtenOn)' +
      '    FROM mindex m4' +
      '    WHERE pub = m2.pub' +
      '  )' +
      ') as renewal, (' +
      // La dernière expiration
      '  SELECT m2.expired_on ' +
      '  FROM mindex m2 ' +
      '  WHERE m2.pub = m1.pub ' +
      '  AND m2.writtenOn = (' +
      '    SELECT MAX(m4.writtenOn)' +
      '    FROM mindex m4' +
      '    WHERE pub = m2.pub' +
      '  )' +
      ') as expiry ' +
      'FROM mindex m1 ' +
      'WHERE m1.expires_on <= ? ' +
      'AND m1.revokes_on > ? ' +
      'AND (renewal IS NULL OR renewal <= ?) ' +
      'AND (expiry IS NULL)', [medianTime, medianTime, medianTime])
  }

  @MonitorExecutionTime()
  async findRevokesOnLteAndRevokedOnIsNull(medianTime: number): Promise<MindexEntry[]> {
    return this.find('SELECT * FROM mindex WHERE revokes_on <= ? AND revoked_on IS NULL', [medianTime])
  }

  @MonitorExecutionTime()
  async getWrittenOn(blockstamp: string): Promise<MindexEntry[]> {
    return this.find('SELECT * FROM mindex WHERE written_on = ?', [blockstamp])
  }

  @MonitorExecutionTime()
  async findRawWithOrder(criterion: { pub?: string }, sort: (string | (string | boolean)[])[]): Promise<MindexEntry[]> {
    let sql = `SELECT * FROM mindex ${criterion.pub ? 'WHERE pub = ?' : ''}`
    if (sort.length) {
      sql += ` ORDER BY ${sort.map(s => `${s[0]} ${s[1] ? 'DESC' : 'ASC'}`).join(', ')}`
    }
    return this.find(sql, criterion.pub ? [criterion.pub] : [])
  }

  private async find(sql: string, params: any[]): Promise<MindexEntry[]> {
    return (await this.driver.sqlRead(sql, params)).map(r => {
      return {
        index: 'MINDEX',
        op: r.op,
        pub: r.pub,
        written_on: r.written_on,
        writtenOn: r.writtenOn,
        created_on: r.created_on,
        type: r.type,
        expires_on: r.expires_on !== null ? r.expires_on : null, // TODO : peut être simplifié..
        expired_on: r.expired_on !== null ? r.expired_on : null,
        revocation: r.revocation,
        revokes_on: r.revokes_on !== null ? r.revokes_on : null,
        chainable_on: r.chainable_on !== null ? r.chainable_on : null,
        revoked_on: r.revoked_on,
        leaving: r.leaving !== null ? r.leaving : null,
        age: 0,
        unchainables: 0,
      }
    })
  }

  @MonitorExecutionTime()
  async getReducedMSForImplicitRevocation(pub: string): Promise<FullMindexEntry | null> {
    return Indexer.DUP_HELPERS.reduceOrNull((await this.reducable(pub)) as FullMindexEntry[])
  }

  @MonitorExecutionTime()
  async getReducedMSForMembershipExpiry(pub: string): Promise<FullMindexEntry | null> {
    return Indexer.DUP_HELPERS.reduceOrNull((await this.reducable(pub)) as FullMindexEntry[])
  }

  @MonitorExecutionTime()
  async getRevokedPubkeys(): Promise<string[]> {
    return (await this.driver.sqlRead('SELECT DISTINCT(pub) FROM mindex WHERE revoked_on IS NOT NULL', [])).map(r => r.pub)
  }

  /**
   * OTHER
   */

  @MonitorExecutionTime()
  async reducable(pub: string): Promise<MindexEntry[]> {
    // await this.dump()
    return this.findEntities('SELECT * FROM mindex WHERE pub = ? order by writtenOn ASC', [pub])
  }

  async findExpiresOnLteAndRevokesOnGt(medianTime: number): Promise<MindexEntry[]> {
    return []
  }

  async getReducedMS(pub: string): Promise<FullMindexEntry | null> {
    return null
  }

}
