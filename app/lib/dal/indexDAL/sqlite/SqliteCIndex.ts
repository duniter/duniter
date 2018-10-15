import {CindexEntry, FullCindexEntry, Indexer} from "../../../indexer"
import {SQLiteDriver} from "../../drivers/SQLiteDriver"
import {MonitorExecutionTime} from "../../../debug/MonitorExecutionTime"
import {SqliteTable} from "./SqliteTable"
import {SqlNotNullableFieldDefinition, SqlNullableFieldDefinition} from "./SqlFieldDefinition"
import {CIndexDAO} from "../abstract/CIndexDAO"

export class SqliteCIndex extends SqliteTable<CindexEntry> implements CIndexDAO {

  constructor(getSqliteDB: (dbName: string)=> Promise<SQLiteDriver>) {
    super(
      'cindex',
      {
        'op':           new SqlNotNullableFieldDefinition('CHAR', false, 6),
        'written_on':   new SqlNotNullableFieldDefinition('VARCHAR', false, 80),
        'writtenOn':    new SqlNotNullableFieldDefinition('INT', true),
        'issuer':       new SqlNotNullableFieldDefinition('VARCHAR', true, 50),
        'receiver':     new SqlNotNullableFieldDefinition('VARCHAR', true, 50),
        'created_on':   new SqlNullableFieldDefinition('INT', true),
        'sig':          new SqlNullableFieldDefinition('VARCHAR', true, 100),
        'chainable_on': new SqlNullableFieldDefinition('INT', true),
        'expires_on':   new SqlNullableFieldDefinition('INT', true),
        'expired_on':   new SqlNullableFieldDefinition('INT', true),
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
  async insert(record: CindexEntry): Promise<void> {
    await this.insertInTable(this.driver, record)
  }

  @MonitorExecutionTime()
  async insertBatch(records: CindexEntry[]): Promise<void> {
    if (records.length) {
      return this.insertBatchInTable(this.driver, records)
    }
  }

  /**
   * DELETE
   */

  @MonitorExecutionTime()
  async removeBlock(blockstamp: string): Promise<void> {
    await this.driver.sqlWrite(`DELETE FROM cindex WHERE written_on = ?`, [blockstamp])
  }

  @MonitorExecutionTime()
  async trimRecords(belowNumber: number): Promise<void> {
    await this.trimExpiredCerts(belowNumber)
  }

  /**
   * FIND
   */

  @MonitorExecutionTime()
  async getWrittenOn(blockstamp: string): Promise<CindexEntry[]> {
    return this.find('SELECT * FROM cindex WHERE written_on = ?', [blockstamp])
  }

  @MonitorExecutionTime()
  async findRawWithOrder(criterion: { pub?: string }, sort: (string | (string | boolean)[])[]): Promise<CindexEntry[]> {
    let sql = `SELECT * FROM cindex ${criterion.pub ? 'WHERE pub = ?' : ''}`
    if (sort.length) {
      sql += ` ORDER BY ${sort.map(s => `${s[0]} ${s[1] ? 'DESC' : 'ASC'}`).join(', ')}`
    }
    return this.find(sql, criterion.pub ? [criterion.pub] : [])
  }

  private async find(sql: string, params: any[]): Promise<CindexEntry[]> {
    return (await this.driver.sqlRead(sql, params)).map(r => {
      return {
        index: 'CINDEX',
        op: r.op,
        written_on: r.written_on,
        writtenOn: r.writtenOn,
        issuer: r.issuer,
        receiver: r.receiver,
        created_on: r.created_on,
        sig: r.sig,
        chainable_on: r.chainable_on,
        expires_on: r.expires_on,
        expired_on: r.expired_on,
        age: 0,
        unchainables: 0,
        stock: 0,
        from_wid: null,
        to_wid: null,
      }
    })
  }

  /**
   * OTHER
   */

  async existsNonReplayableLink(issuer: string, receiver: string): Promise<boolean> {
    return (await this.find('SELECT * FROM cindex c1 ' +
      'WHERE c1.op = ?' +
      'AND issuer = ? ' +
      'AND receiver = ? ' +
      'AND NOT EXISTS (' +
      '  SELECT *' +
      '  FROM cindex c2' +
      '  WHERE c1.issuer = c2.issuer' +
      '  AND c1.receiver = c2.receiver' +
      '  AND c1.created_on = c2.created_on' +
      '  AND c2.writtenOn > c1.writtenOn' +
      ')', ['CREATE', issuer, receiver])).length > 0
  }

  findByIssuer(issuer: string): Promise<CindexEntry[]> {
    return this.find('SELECT * FROM cindex ' +
      'WHERE issuer = ? ', [issuer])
  }

  findByIssuerAndChainableOnGt(issuer: string, medianTime: number): Promise<CindexEntry[]> {
    return this.find('SELECT * FROM cindex ' +
      'WHERE issuer = ? ' +
      'AND chainable_on > ?', [issuer, medianTime])
  }

  findByIssuerAndReceiver(issuer: string, receiver: string): Promise<CindexEntry[]> {
    return this.find('SELECT * FROM cindex ' +
      'WHERE issuer = ? ' +
      'AND receiver = ?', [issuer, receiver])
  }

  async findByReceiverAndExpiredOn(pub: string, expired_on: number): Promise<CindexEntry[]> {
    return this.find('SELECT * FROM cindex ' +
      'WHERE receiver = ? ' +
      'AND expired_on = ?', [pub, expired_on])
  }

  findExpired(medianTime: number): Promise<CindexEntry[]> {
    return this.find('SELECT * FROM cindex c1 ' +
      'WHERE c1.expires_on <= ? ' +
      'AND NOT EXISTS (' +
      '  SELECT *' +
      '  FROM cindex c2' +
      '  WHERE c1.issuer = c2.issuer' +
      '  AND c1.receiver = c2.receiver' +
      '  AND c1.created_on = c2.created_on' +
      '  AND c2.writtenOn > c1.writtenOn' +
      ')', [medianTime])
  }

  async getReceiversAbove(minsig: number): Promise<string[]> {
    return (await this.find('SELECT DISTINCT(c1.receiver) FROM cindex c1 ' +
      'GROUP BY c1.receiver ' +
      'HAVING COUNT(c1.issuer) > ?', [minsig])).map(r => r.receiver)
  }

  getValidLinksFrom(issuer: string): Promise<CindexEntry[]> {
    return this.find('SELECT * FROM cindex c1 ' +
      'WHERE c1.issuer = ? ' +
      'AND NOT EXISTS (' +
      '  SELECT *' +
      '  FROM cindex c2' +
      '  WHERE c1.issuer = c2.issuer' +
      '  AND c1.receiver = c2.receiver' +
      '  AND c1.created_on = c2.created_on' +
      '  AND c2.writtenOn > c1.writtenOn' +
      '  AND c2.expired_on IS NOT NULL' +
      ')', [issuer])
  }

  async getValidLinksTo(receiver: string): Promise<CindexEntry[]> {
    return this.find('SELECT * FROM cindex c1 ' +
      'WHERE c1.receiver = ? ' +
      'AND NOT EXISTS (' +
      '  SELECT *' +
      '  FROM cindex c2' +
      '  WHERE c1.issuer = c2.issuer' +
      '  AND c1.receiver = c2.receiver' +
      '  AND c1.created_on = c2.created_on' +
      '  AND c2.writtenOn > c1.writtenOn' +
      '  AND c2.expired_on IS NOT NULL' +
      ')', [receiver])
  }

  async reducablesFrom(from: string): Promise<FullCindexEntry[]> {
    const certs = await this.find('SELECT * FROM cindex WHERE issuer = ? ORDER BY issuer, receiver, created_on, writtenOn', [from])
    return Indexer.DUP_HELPERS.reduceBy(certs, ['issuer', 'receiver', 'created_on'])
  }

  async trimExpiredCerts(belowNumber: number): Promise<void> {
    const certs = await this.find('SELECT * FROM cindex WHERE expired_on > 0 AND writtenOn < ?', [belowNumber])
    await Promise.all(certs.map(async c => this.driver.sqlWrite('DELETE FROM cindex WHERE issuer = ? AND receiver = ? AND created_on = ?', [
        c.issuer,
        c.receiver,
        c.created_on
      ])
    ))
  }
}
