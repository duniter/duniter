import { MonitorExecutionTime } from "../../../debug/MonitorExecutionTime";
import { DividendDAO, DividendEntry, UDSource } from "../abstract/DividendDAO";
import {
  IindexEntry,
  SimpleTxInput,
  SimpleUdEntryForWallet,
  SindexEntry,
} from "../../../indexer";
import { DividendDaoHandler } from "../common/DividendDaoHandler";
import { DataErrors } from "../../../common-libs/errors";
import { LevelUp } from "levelup";
import { LevelDBTable } from "./LevelDBTable";
import { Underscore } from "../../../common-libs/underscore";
import { AbstractIteratorOptions } from "abstract-leveldown";

interface Consumption {
  writtenOn: number;
  pub: string;
}

export class LevelDBDividend extends LevelDBTable<DividendEntry>
  implements DividendDAO {
  private indexForTrimming: LevelDBTable<string[]>;
  private hasIndexed = false;

  constructor(protected getLevelDB: (dbName: string) => Promise<LevelUp>) {
    super("level_dividend", getLevelDB);
  }

  /**
   * TECHNICAL
   */

  cleanCache(): void {}

  triggerInit(): void {}

  async init(): Promise<void> {
    await super.init();
    this.indexForTrimming = new LevelDBTable<string[]>(
      "level_dividend/level_dividend_trim_index",
      this.getLevelDB
    );
    await this.indexForTrimming.init();
  }

  async close(): Promise<void> {
    await super.close();
    await this.indexForTrimming.close();
  }

  /**
   * INSERT
   */

  @MonitorExecutionTime()
  async insert(record: DividendEntry): Promise<void> {
    await this.insertBatch([record]);
  }

  @MonitorExecutionTime()
  async insertBatch(records: DividendEntry[]): Promise<void> {
    await this.batchInsert(records, "pub");
  }

  private async indexConsumptions(consumptions: Consumption[]) {
    // Index the operations by write date, for future trimming
    const consumedPerWrittenOn: { [k: number]: string[] } = {};
    consumptions.forEach((f) => {
      if (!consumedPerWrittenOn[f.writtenOn]) {
        consumedPerWrittenOn[f.writtenOn] = [];
      }
      consumedPerWrittenOn[f.writtenOn].push(f.pub);
    });
    const writtenOns = Underscore.keys(consumedPerWrittenOn);
    await Promise.all(
      writtenOns.map(async (writtenOn) => {
        const existing: string[] =
          (await this.indexForTrimming.getOrNull(
            LevelDBDividend.trimKey(writtenOn)
          )) || [];
        const toBeStored = Underscore.uniq(
          existing.concat(consumedPerWrittenOn[writtenOn])
        );
        await this.indexForTrimming.put(
          LevelDBDividend.trimKey(writtenOn),
          toBeStored
        );
      })
    );
  }

  async consume(filter: SindexEntry[]): Promise<void> {
    for (const dividendToConsume of filter) {
      const row = await this.get(dividendToConsume.identifier);
      DividendDaoHandler.consume(row, dividendToConsume);
      await this.put(row.pub, row);
    }
    await this.indexConsumptions(
      filter.map((f) => ({ writtenOn: f.writtenOn, pub: f.identifier }))
    );
  }

  async createMember(pub: string): Promise<void> {
    const existing = await this.getOrNull(pub);
    if (!existing) {
      await this.insert(DividendDaoHandler.getNewDividendEntry(pub));
    } else {
      await this.setMember(true, pub);
    }
  }

  async deleteMember(pub: string): Promise<void> {
    await this.del(pub);
  }

  async findForDump(criterion: any): Promise<SindexEntry[]> {
    const entries: DividendEntry[] = [];
    await this.readAll((entry) => entries.push(entry));
    return DividendDaoHandler.toDump(entries);
  }

  async findRawWithOrder(
    criterion: { pub?: string },
    sort: (string | (string | boolean)[])[]
  ): Promise<DividendEntry[]> {
    const entries: DividendEntry[] = [];
    await this.readAll((entry) => entries.push(entry));
    return entries;
  }

  async findUdSourceByIdentifierPosAmountBase(
    identifier: string,
    pos: number,
    amount: number,
    base: number
  ): Promise<SimpleTxInput[]> {
    const member: DividendEntry | null = await this.get(identifier);
    return DividendDaoHandler.getUDSourceByIdPosAmountBase(
      member,
      identifier,
      pos,
      amount,
      base
    );
  }

  async getUDSource(
    identifier: string,
    pos: number
  ): Promise<SimpleTxInput | null> {
    const member: DividendEntry | null = await this.get(identifier);
    return DividendDaoHandler.getUDSource(member, identifier, pos);
  }

  async getUDSources(pub: string): Promise<UDSource[]> {
    const member: DividendEntry | null = await this.getOrNull(pub);
    if (!member) {
      return [];
    }
    return DividendDaoHandler.udSources(member);
  }

  getWrittenOn(blockstamp: string): Promise<DividendEntry[]> {
    throw Error(
      DataErrors[
        DataErrors.DIVIDEND_GET_WRITTEN_ON_SHOULD_NOT_BE_USED_DIVIDEND_DAO
      ]
    );
  }

  async getWrittenOnUDs(number: number): Promise<SimpleUdEntryForWallet[]> {
    const res: SimpleUdEntryForWallet[] = [];
    await this.readAll((entry) => {
      if (entry.member) {
        DividendDaoHandler.getWrittenOnUDs(entry, number, res);
      }
    });
    return res;
  }

  async produceDividend(
    blockNumber: number,
    dividend: number,
    unitbase: number,
    local_iindex: IindexEntry[]
  ): Promise<SimpleUdEntryForWallet[]> {
    const dividends: SimpleUdEntryForWallet[] = [];
    const updates: Promise<void>[] = [];
    await this.readAll((entry) => {
      if (entry.member) {
        DividendDaoHandler.produceDividend(
          entry,
          blockNumber,
          dividend,
          unitbase,
          dividends
        );
        updates.push(this.put(entry.pub, entry));
      }
    });
    await Promise.all(updates);
    return dividends;
  }

  removeBlock(blockstamp: string): Promise<void> {
    throw Error(
      DataErrors[
        DataErrors.DIVIDEND_REMOVE_BLOCK_SHOULD_NOT_BE_USED_BY_DIVIDEND_DAO
      ]
    );
  }

  async revertUDs(
    number: number
  ): Promise<{
    createdUDsDestroyedByRevert: SimpleUdEntryForWallet[];
    consumedUDsRecoveredByRevert: SimpleUdEntryForWallet[];
  }> {
    const createdUDsDestroyedByRevert: SimpleUdEntryForWallet[] = [];
    const consumedUDsRecoveredByRevert: SimpleUdEntryForWallet[] = [];
    const updates: Promise<void>[] = [];
    // Remove produced dividends at this block
    await this.readAll((entry) => {
      if (entry.availables.includes(number)) {
        DividendDaoHandler.removeDividendsProduced(
          entry,
          number,
          createdUDsDestroyedByRevert
        );
        updates.push(this.put(entry.pub, entry));
      }
      if (entry.consumed.includes(number)) {
        DividendDaoHandler.unconsumeDividends(
          entry,
          number,
          consumedUDsRecoveredByRevert
        );
        updates.push(this.put(entry.pub, entry));
      }
    });
    await Promise.all(updates);
    await this.indexForTrimming.del(LevelDBDividend.trimKey(number)); // TODO: test
    return {
      createdUDsDestroyedByRevert,
      consumedUDsRecoveredByRevert,
    };
  }

  async setMember(member: boolean, pub: string): Promise<void> {
    const entry = await this.get(pub);
    entry.member = member;
    await this.put(pub, entry);
  }

  async trimConsumedUDs(belowNumber: number): Promise<void> {
    const count = await this.indexForTrimming.count();
    if (count === 0 && !this.hasIndexed) {
      this.hasIndexed = true;
      await this.applyAllKeyValue(async (data) => {
        await this.indexConsumptions(
          data.value.consumed.map((c) => ({
            writtenOn: c,
            pub: data.value.pub,
          }))
        );
      });
    }
    const updates: Promise<void>[] = [];
    const trimmedNumbers: string[] = [];
    // Remove produced dividends at this block
    await this.indexForTrimming.readAllKeyValue(
      (kv) => {
        updates.push(
          (async () => {
            const pubkeys = kv.value;
            const trimNumber = kv.key;
            for (const pub of pubkeys) {
              const entry = await this.get(pub);
              if (DividendDaoHandler.trimConsumed(entry, belowNumber)) {
                await this.put(entry.pub, entry);
                trimmedNumbers.push(trimNumber);
              }
            }
          })()
        );
      },
      {
        lt: LevelDBDividend.trimKey(belowNumber),
      }
    );
    await Promise.all(updates);
    await Promise.all(
      trimmedNumbers.map((trimKey) => this.indexForTrimming.del(trimKey))
    );
  }

  async listAll(): Promise<DividendEntry[]> {
    const entries: DividendEntry[] = [];
    await this.readAll((entry) => entries.push(entry));
    return entries;
  }

  private static trimKey(writtenOn: number) {
    return String(writtenOn).padStart(10, "0");
  }

  async count(options?: AbstractIteratorOptions): Promise<number> {
    let count = 0;
    await this.readAllKeyValue((entry) => {
      count += entry.value.availables.length;
    });
    return count;
  }
}
