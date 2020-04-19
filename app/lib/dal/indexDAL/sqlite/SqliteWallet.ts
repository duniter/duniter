import { SQLiteDriver } from "../../drivers/SQLiteDriver";
import { MonitorExecutionTime } from "../../../debug/MonitorExecutionTime";
import { SqliteTable } from "./SqliteTable";
import { SqlNotNullableFieldDefinition } from "./SqlFieldDefinition";
import { WalletDAO } from "../abstract/WalletDAO";
import { DBWallet } from "../../../db/DBWallet";

export class SqliteWallet extends SqliteTable<DBWallet> implements WalletDAO {
  constructor(getSqliteDB: (dbName: string) => Promise<SQLiteDriver>) {
    super(
      "wallet",
      {
        conditions: new SqlNotNullableFieldDefinition("VARCHAR", true, 1000),
        balance: new SqlNotNullableFieldDefinition("INT", true),
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
  async insert(record: DBWallet): Promise<void> {
    await this.insertInTable(this.driver, record);
  }

  @MonitorExecutionTime()
  async insertBatch(records: DBWallet[]): Promise<void> {
    if (records.length) {
      return this.insertBatchInTable(this.driver, records);
    }
  }

  private async find(sql: string, params: any[]): Promise<DBWallet[]> {
    return (await this.driver.sqlRead(sql, params)).map((r) => {
      return {
        conditions: r.conditions,
        balance: r.balance,
      };
    });
  }

  async getWallet(conditions: string): Promise<DBWallet> {
    return (
      await this.find("SELECT * FROM wallet WHERE conditions = ?", [conditions])
    )[0];
  }

  async saveWallet(wallet: DBWallet): Promise<DBWallet> {
    await this.insert(wallet);
    return wallet;
  }

  listAll(): Promise<DBWallet[]> {
    return this.find("SELECT * FROM wallet", []);
  }
}
