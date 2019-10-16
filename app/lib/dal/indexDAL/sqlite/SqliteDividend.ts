import {SQLiteDriver} from "../../drivers/SQLiteDriver"
import {MonitorExecutionTime} from "../../../debug/MonitorExecutionTime"
import {SqliteTable} from "./SqliteTable"
import {SqlNotNullableFieldDefinition} from "./SqlFieldDefinition"
import {DividendDAO, DividendEntry, UDSource} from "../abstract/DividendDAO"
import {IindexEntry, SimpleTxInput, SimpleUdEntryForWallet, SindexEntry} from "../../../indexer"
import {DividendDaoHandler} from "../common/DividendDaoHandler"
import {DataErrors} from "../../../common-libs/errors"

export class SqliteDividend extends SqliteTable<DividendEntry> implements DividendDAO {

  constructor(getSqliteDB: (dbName: string)=> Promise<SQLiteDriver>) {
    super(
      'dividend',
      {
        'pub':         new SqlNotNullableFieldDefinition('VARCHAR', true, 50),
        'member':      new SqlNotNullableFieldDefinition('BOOLEAN', true),
        'availables':  new SqlNotNullableFieldDefinition('JSON', false),
        'consumed':    new SqlNotNullableFieldDefinition('JSON', false),
        'consumedUDs': new SqlNotNullableFieldDefinition('JSON', false),
        'dividends':   new SqlNotNullableFieldDefinition('JSON', false),
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
  async insert(record: DividendEntry): Promise<void> {
    await this.insertInTable(this.driver, record)
  }

  @MonitorExecutionTime()
  async insertBatch(records: DividendEntry[]): Promise<void> {
    if (records.length) {
      return this.insertBatchInTable(this.driver, records)
    }
  }

  private async find(sql: string, params: any[]): Promise<DividendEntry[]> {
    return (await this.driver.sqlRead(sql, params)).map(r => {
      return {
        pub: r.pub,
        member: r.member,
        availables:  r.availables  == null ? null : JSON.parse(r.availables as any),
        consumed:    r.consumed    == null ? null : JSON.parse(r.consumed as any),
        consumedUDs: r.consumedUDs == null ? null : JSON.parse(r.consumedUDs as any),
        dividends:   r.dividends   == null ? null : JSON.parse(r.dividends as any),
      }
    })
  }

  async consume(filter: SindexEntry[]): Promise<void> {
    for (const dividendToConsume of filter) {
      const row = (await this.find('SELECT * FROM dividend WHERE pub = ?', [dividendToConsume.identifier]))[0]
      DividendDaoHandler.consume(row, dividendToConsume)
      await this.update(this.driver, row, ['consumed', 'consumedUDs', 'availables', 'dividends'], ['pub'])
    }
  }

  async createMember(pub: string): Promise<void> {
    const existing = (await this.find('SELECT * FROM dividend WHERE pub = ?', [pub]))[0]
    if (!existing) {
      await this.insert(DividendDaoHandler.getNewDividendEntry(pub))
    } else {
      await this.setMember(true, pub)
    }
  }

  deleteMember(pub: string): Promise<void> {
    return this.driver.sqlWrite('DELETE FROM dividend WHERE pub = ?', [pub])
  }

  async findForDump(criterion: any): Promise<SindexEntry[]> {
    return DividendDaoHandler.toDump(await this.find('SELECT * FROM dividend', []))
  }

  findRawWithOrder(criterion: { pub?: string }, sort: (string | (string | boolean)[])[]): Promise<DividendEntry[]> {
    let sql = `SELECT * FROM dividend ${criterion.pub ? 'WHERE pub = ?' : ''}`
    if (sort.length) {
      sql += ` ORDER BY ${sort.map(s => `${s[0]} ${s[1] ? 'DESC' : 'ASC'}`).join(', ')}`
    }
    return this.find(sql, criterion.pub ? [criterion.pub] : [])
  }

  async findUdSourceByIdentifierPosAmountBase(identifier: string, pos: number, amount: number, base: number): Promise<SimpleTxInput[]> {
    const member = (await this.find('SELECT * FROM dividend WHERE pub = ?', [identifier]))[0]
    return DividendDaoHandler.getUDSourceByIdPosAmountBase(member, identifier, pos, amount, base)
  }

  async getUDSource(identifier: string, pos: number): Promise<SimpleTxInput | null> {
    const member = (await this.find('SELECT * FROM dividend WHERE pub = ?', [identifier]))[0]
    return DividendDaoHandler.getUDSource(member, identifier, pos)
  }

  async getUDSources(pub: string): Promise<UDSource[]> {
    const member = (await this.find('SELECT * FROM dividend WHERE pub = ?', [pub]))[0]
    if (!member) {
      return []
    }
    return DividendDaoHandler.udSources(member)
  }

  getWrittenOn(blockstamp: string): Promise<DividendEntry[]> {
    throw Error(DataErrors[DataErrors.DIVIDEND_GET_WRITTEN_ON_SHOULD_NOT_BE_USED_DIVIDEND_DAO])
  }

  async getWrittenOnUDs(number: number): Promise<SimpleUdEntryForWallet[]> {
    const res: SimpleUdEntryForWallet[] = []
    const rows = await this.find('SELECT * FROM dividend WHERE member', [])
    for (const row of rows) {
      DividendDaoHandler.getWrittenOnUDs(row, number, res)
    }
    return res
  }

  async produceDividend(blockNumber: number, dividend: number, unitbase: number, local_iindex: IindexEntry[]): Promise<SimpleUdEntryForWallet[]> {
    const dividends: SimpleUdEntryForWallet[] = []
    const rows = await this.find('SELECT * FROM dividend WHERE member', [])
    for (const row of rows) {
      DividendDaoHandler.produceDividend(row, blockNumber, dividend, unitbase, dividends)
      await this.update(this.driver, row, ['availables', 'dividends'], ['pub'])
    }
    return dividends
  }

  removeBlock(blockstamp: string): Promise<void> {
    throw Error(DataErrors[DataErrors.DIVIDEND_REMOVE_BLOCK_SHOULD_NOT_BE_USED_BY_DIVIDEND_DAO])
  }

  async revertUDs(number: number): Promise<{
    createdUDsDestroyedByRevert: SimpleUdEntryForWallet[]
    consumedUDsRecoveredByRevert: SimpleUdEntryForWallet[]
  }> {
    const createdUDsDestroyedByRevert: SimpleUdEntryForWallet[] = []
    const consumedUDsRecoveredByRevert: SimpleUdEntryForWallet[] = []
    // Remove produced dividends at this block
    const rows = await this.find('SELECT * FROM dividend WHERE availables like ? or dividends like ?', ['%' + number + '%', '%' + number + '%'])
    for (const row of rows.filter(row => row.availables.includes(number))) {
      DividendDaoHandler.removeDividendsProduced(row, number, createdUDsDestroyedByRevert)
      await this.update(this.driver, row, ['availables', 'dividends'], ['pub'])
    }
    // Unconsumed dividends consumed at this block
    for (const row of rows.filter(row => row.consumed.includes(number))) {
      DividendDaoHandler.unconsumeDividends(row, number, consumedUDsRecoveredByRevert)
      await this.update(this.driver, row, ['availables', 'dividends'], ['pub'])
    }
    return {
      createdUDsDestroyedByRevert,
      consumedUDsRecoveredByRevert,
    }
  }

  async setMember(member: boolean, pub: string): Promise<void> {
    await this.driver.sqlWrite('UPDATE dividend SET member = ? WHERE pub = ?', [true, pub])
  }

  async trimConsumedUDs(belowNumber: number): Promise<void> {
    const rows = await this.find('SELECT * FROM dividend', [])
    for (const row of rows) {
      if (DividendDaoHandler.trimConsumed(row, belowNumber)) {
        await this.update(this.driver, row, ['consumed', 'consumedUDs'], ['pub'])
      }
    }
  }

  listAll(): Promise<DividendEntry[]> {
    return this.find('SELECT * FROM dividend', [])
  }
}
