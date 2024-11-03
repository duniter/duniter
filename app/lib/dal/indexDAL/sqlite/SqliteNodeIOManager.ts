import { SQLiteDriver } from "../../drivers/SQLiteDriver";
import { MonitorExecutionTime } from "../../../debug/MonitorExecutionTime";
import { NewLogger } from "../../../logger";
import { ExitCodes } from "../../../common-libs/exit-codes";
import { CommonConstants } from "../../../common-libs/constants";

export class SqliteNodeIOManager<T> {
  private writePromise: Promise<any> | null = null;
  private writePendingCount = 0;

  constructor(private driver: SQLiteDriver, private id: string) {}

  @MonitorExecutionTime("id")
  private async wait4writing() {
    await this.writePromise;
    // We no more need to wait
    this.writePromise = null;
    this.writePendingCount = 0;
  }

  public async sqlWrite(sql: string, params: any[]) {
    if (this.writePendingCount >= CommonConstants.MAX_SQLITE_WRITE_PENDINGS) {
      await this.wait4writing();
    }

    this.writePendingCount++;
    // Just promise that the writing will be done
    this.writePromise = (this.writePromise || Promise.resolve())
      .then(() => this.driver.executeAll(sql, params))
      .then(() => this.writePendingCount--)
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
    if (this.writePromise) {
      // Wait for current writings to be done
      await this.wait4writing();
    }
    await this.driver.closeConnection();
  }
}
