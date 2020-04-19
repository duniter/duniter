import { MonitorExecutionTime } from "../../../debug/MonitorExecutionTime";
import { LevelUp } from "levelup";
import { LevelDBTable } from "./LevelDBTable";
import { BIndexDAO } from "../abstract/BIndexDAO";
import { DBHead } from "../../../db/DBHead";
import { Underscore } from "../../../common-libs/underscore";

export class LevelDBBindex extends LevelDBTable<DBHead> implements BIndexDAO {
  constructor(getLevelDB: (dbName: string) => Promise<LevelUp>) {
    super("level_bindex", getLevelDB);
  }

  /**
   * INSERT
   */

  @MonitorExecutionTime()
  async insert(record: DBHead): Promise<void> {
    await this.insertBatch([record]);
  }

  @MonitorExecutionTime()
  async insertBatch(records: DBHead[]): Promise<void> {
    // Update the max headNumber
    await this.batchInsertWithKeyComputing(records, (r) =>
      LevelDBBindex.trimKey(r.number)
    );
  }

  findRawWithOrder(
    criterion: { pub?: string },
    sort: (string | (string | boolean)[])[]
  ): Promise<DBHead[]> {
    return this.findAllValues();
  }

  async getWrittenOn(blockstamp: string): Promise<DBHead[]> {
    return [await this.get(LevelDBBindex.trimKey(parseInt(blockstamp)))];
  }

  async head(n: number): Promise<DBHead> {
    return (
      (
        await this.findAllValues({
          limit: n,
          reverse: true,
        })
      )[n - 1] || null
    );
  }

  async range(n: number, m: number): Promise<DBHead[]> {
    const head = await this.head(1);
    if (!head) {
      return [];
    }
    const from = head.number - n + 2;
    const to = head.number - m;
    return this.findAllValues({
      gt: LevelDBBindex.trimKey(to),
      lt: LevelDBBindex.trimKey(from),
      reverse: true,
    });
  }

  async removeBlock(blockstamp: string): Promise<void> {
    await this.del(LevelDBBindex.trimKey(parseInt(blockstamp)));
  }

  async tail(): Promise<DBHead> {
    return (
      (
        await this.findAllValues({
          limit: 1,
        })
      )[0] || null
    );
  }

  async trimBlocks(maxnumber: number): Promise<void> {
    const tail = await this.tail();
    if (!tail) {
      return;
    }
    const from = Math.max(tail.number, 0);
    await Promise.all(
      Underscore.range(from, maxnumber).map(async (k) => {
        await this.del(LevelDBBindex.trimKey(k));
      })
    );
  }

  private static trimKey(number: number) {
    return String(number).padStart(10, "0");
  }
}
