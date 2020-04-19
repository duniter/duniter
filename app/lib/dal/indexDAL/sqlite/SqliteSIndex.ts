import {
  FullSindexEntry,
  Indexer,
  SimpleTxEntryForWallet,
  SimpleTxInput,
  SindexEntry,
} from "../../../indexer";
import { SQLiteDriver } from "../../drivers/SQLiteDriver";
import { MonitorExecutionTime } from "../../../debug/MonitorExecutionTime";
import { SqliteTable } from "./SqliteTable";
import {
  SqlNotNullableFieldDefinition,
  SqlNullableFieldDefinition,
} from "./SqlFieldDefinition";
import { SIndexDAO } from "../abstract/SIndexDAO";

export class SqliteSIndex extends SqliteTable<SindexEntry>
  implements SIndexDAO {
  constructor(getSqliteDB: (dbName: string) => Promise<SQLiteDriver>) {
    super(
      "sindex",
      {
        op: new SqlNotNullableFieldDefinition("CHAR", false, 6),
        written_on: new SqlNotNullableFieldDefinition("VARCHAR", false, 80),
        writtenOn: new SqlNotNullableFieldDefinition("INT", true),
        srcType: new SqlNotNullableFieldDefinition("CHAR", true, 1),
        tx: new SqlNullableFieldDefinition("VARCHAR", true, 70),
        identifier: new SqlNotNullableFieldDefinition("VARCHAR", true, 70),
        pos: new SqlNotNullableFieldDefinition("INT", true),
        created_on: new SqlNullableFieldDefinition("VARCHAR", false, 100),
        written_time: new SqlNotNullableFieldDefinition("INT", true),
        locktime: new SqlNullableFieldDefinition("INT", false),
        unlock: new SqlNullableFieldDefinition("VARCHAR", false, 255),
        amount: new SqlNotNullableFieldDefinition("INT", false),
        base: new SqlNotNullableFieldDefinition("INT", false),
        conditions: new SqlNotNullableFieldDefinition("VARCHAR", true, 1000),
        consumed: new SqlNullableFieldDefinition("BOOLEAN", true),
      },
      getSqliteDB
    );
  }

  /**
   * TECHNICAL
   */

  cleanCache(): void {}

  triggerInit(): void {}

  /**
   * INSERT
   */

  @MonitorExecutionTime()
  async insert(record: SindexEntry): Promise<void> {
    await this.insertInTable(this.driver, record);
  }

  @MonitorExecutionTime()
  async insertBatch(records: SindexEntry[]): Promise<void> {
    if (records.length) {
      return this.insertBatchInTable(this.driver, records);
    }
  }

  /**
   * DELETE
   */

  @MonitorExecutionTime()
  async removeBlock(blockstamp: string): Promise<void> {
    await this.driver.sqlWrite(`DELETE FROM sindex WHERE written_on = ?`, [
      blockstamp,
    ]);
  }

  @MonitorExecutionTime()
  async trimRecords(belowNumber: number): Promise<void> {
    await this.trimConsumedSource(belowNumber);
  }

  /**
   * FIND
   */

  @MonitorExecutionTime()
  async getWrittenOn(blockstamp: string): Promise<SindexEntry[]> {
    return this.find("SELECT * FROM sindex WHERE written_on = ?", [blockstamp]);
  }

  @MonitorExecutionTime()
  async findRawWithOrder(
    criterion: { pub?: string },
    sort: (string | (string | boolean)[])[]
  ): Promise<SindexEntry[]> {
    let sql = `SELECT * FROM sindex ${criterion.pub ? "WHERE pub = ?" : ""}`;
    if (sort.length) {
      sql += ` ORDER BY ${sort
        .map((s) => `${s[0]} ${s[1] ? "DESC" : "ASC"}`)
        .join(", ")}`;
    }
    return this.find(sql, criterion.pub ? [criterion.pub] : []);
  }

  private async find(sql: string, params: any[]): Promise<SindexEntry[]> {
    return (await this.driver.sqlRead(sql, params)).map((r) => {
      return {
        index: "CINDEX",
        op: r.op,
        written_on: r.written_on,
        writtenOn: r.writtenOn,
        srcType: r.srcType,
        tx: r.tx,
        identifier: r.identifier,
        pos: r.pos,
        created_on: r.created_on,
        written_time: r.written_time,
        locktime: r.locktime,
        unlock: r.unlock,
        amount: r.amount,
        base: r.base,
        conditions: r.conditions,
        consumed: r.consumed,
        txObj: null as any,
        age: 0,
      };
    });
  }

  /**
   * OTHER
   */

  findByIdentifier(identifier: string): Promise<SindexEntry[]> {
    return this.find("SELECT * FROM sindex WHERE identifier = ?", [identifier]);
  }

  findByPos(pos: number): Promise<SindexEntry[]> {
    return this.find("SELECT * FROM sindex WHERE pos = ?", [pos]);
  }

  findTxSourceByIdentifierPosAmountBase(
    identifier: string,
    pos: number,
    amount: number,
    base: number
  ): Promise<SimpleTxInput[]> {
    return this.find(
      "SELECT * FROM sindex " +
        "WHERE identifier = ? " +
        "AND pos = ? " +
        "AND amount = ? " +
        "AND base = ?",
      [identifier, pos, amount, base]
    );
  }

  getAvailableForConditions(conditionsStr: string): Promise<SindexEntry[]> {
    return this.find(
      "SELECT * FROM sindex s1 " +
        "WHERE s1.conditions LIKE ? " +
        "AND NOT s1.consumed " +
        "AND NOT EXISTS (" +
        "  SELECT * FROM sindex s2" +
        "  WHERE s1.identifier = s2.identifier" +
        "  AND s1.pos = s2.pos" +
        "  AND s2.consumed" +
        ")",
      [conditionsStr]
    );
  }

  async getAvailableForPubkey(
    pubkey: string
  ): Promise<
    {
      amount: number;
      base: number;
      conditions: string;
      identifier: string;
      pos: number;
    }[]
  > {
    return this.getAvailableForConditions(`SIG(${pubkey})`); // TODO: maybe %SIG(...)%
  }

  async getTxSource(
    identifier: string,
    pos: number
  ): Promise<FullSindexEntry | null> {
    const entries = await this.find(
      "SELECT * FROM sindex WHERE identifier = ? AND pos = ? ORDER BY writtenOn",
      [identifier, pos]
    );
    return Indexer.DUP_HELPERS.reduceOrNull(entries);
  }

  async getWrittenOnTxs(blockstamp: string): Promise<SimpleTxEntryForWallet[]> {
    const entries = await this.find(
      "SELECT * FROM sindex WHERE written_on = ?",
      [blockstamp]
    );
    const res: SimpleTxEntryForWallet[] = [];
    entries.forEach((s) => {
      res.push({
        srcType: "T",
        op: s.op,
        conditions: s.conditions,
        amount: s.amount,
        base: s.base,
        identifier: s.identifier,
        pos: s.pos,
      });
    });
    return res;
  }

  async trimConsumedSource(belowNumber: number): Promise<void> {
    const sources = await this.find(
      "SELECT * FROM sindex WHERE consumed AND writtenOn < ?",
      [belowNumber]
    );
    await Promise.all(
      sources.map(async (s) =>
        this.driver.sqlWrite(
          "DELETE FROM sindex " + "WHERE identifier = ? " + "AND pos = ?",
          [s.identifier, s.pos]
        )
      )
    );
  }
}
