import { SQLiteDriver } from "../../drivers/SQLiteDriver";
import { MonitorExecutionTime } from "../../../debug/MonitorExecutionTime";
import { NewLogger } from "../../../logger";
import { ExitCodes } from "../../../common-libs/exit-codes";

export class SqliteNodeIOManager<T> {
  private writePromise: Promise<any> | null = null;

  constructor(private driver: SQLiteDriver, private id: string) {}

  @MonitorExecutionTime("id")
  private async wait4writing() {
    await this.writePromise;
    // We no more need to wait
    this.writePromise = null;
  }

  public async sqlWrite(sql: string, params: any[]) {
    // // Just promise that the writing will be done
    this.writePromise = (this.writePromise || Promise.resolve())
      .then(() => this.driver.executeAll(sql, params))
      .catch((e) => {
        NewLogger().error(e);
        process.exit(ExitCodes.MINDEX_WRITING_ERROR);
      });
  }

  public async sqlExec(sql: string) {
    if (this.writePromise) {
      // Wait for current writings to be done
      await this.wait4writing();
    }
    return this.driver.executeSql(sql);
  }

  public async sqlRead(sql: string, params: any[]): Promise<T[]> {
    if (this.writePromise) {
      // Wait for current writings to be done
      await this.wait4writing();
    }
    return this.driver.executeAll(sql, params);
  }

  async close() {
    await this.driver.closeConnection();
  }
}
