import { MonitorExecutionTime } from "../../../debug/MonitorExecutionTime";
import {
  FullMindexEntry,
  MindexEntry,
  reduce,
  reduceForDBTrimming,
  reduceOrNull,
} from "../../../indexer";
import { LevelUp } from "levelup";
import { LevelDBTable } from "./LevelDBTable";
import { Underscore } from "../../../common-libs/underscore";
import { pint } from "../../../common-libs/pint";
import { reduceConcat, reduceGroupBy } from "../../../common-libs/reduce";
import { LevelDBWrittenOnIndexer } from "./indexers/LevelDBWrittenOnIndexer";
import { MIndexDAO } from "../abstract/MIndexDAO";
import { LevelMIndexRevokesOnIndexer } from "./indexers/LevelMIndexRevokesOnIndexer";
import { LevelMIndexExpiresOnIndexer } from "./indexers/LevelMIndexExpiresOnIndexer";

export class LevelDBMindex extends LevelDBTable<MindexEntry[]>
  implements MIndexDAO {
  private indexForExpiresOn: LevelMIndexExpiresOnIndexer;
  private indexForRevokesOn: LevelMIndexRevokesOnIndexer;
  private indexForWrittenOn: LevelDBWrittenOnIndexer<MindexEntry>;

  constructor(protected getLevelDB: (dbName: string) => Promise<LevelUp>) {
    super("level_mindex", getLevelDB);
  }

  /**
   * TECHNICAL
   */

  async init(): Promise<void> {
    await super.init();
    this.indexForExpiresOn = new LevelMIndexExpiresOnIndexer(
      "level_mindex/expiresOn",
      this.getLevelDB
    );
    this.indexForRevokesOn = new LevelMIndexRevokesOnIndexer(
      "level_mindex/revokesOn",
      this.getLevelDB
    );
    this.indexForWrittenOn = new LevelDBWrittenOnIndexer(
      "level_mindex/writtenOn",
      this.getLevelDB,
      (i) => i.pub
    );
    await this.indexForExpiresOn.init();
    await this.indexForRevokesOn.init();
    await this.indexForWrittenOn.init();
  }

  async close(): Promise<void> {
    await super.close();
    await this.indexForExpiresOn.close();
    await this.indexForRevokesOn.close();
    await this.indexForWrittenOn.close();
  }

  /**
   * INSERT
   */

  @MonitorExecutionTime()
  async insert(record: MindexEntry): Promise<void> {
    await this.insertBatch([record]);
  }

  @MonitorExecutionTime()
  async insertBatch(records: MindexEntry[]): Promise<void> {
    // Database insertion
    let prevRecords: MindexEntry[] = [];
    const recordsByPub = reduceGroupBy(records, "pub");
    await Promise.all(
      Underscore.keys(recordsByPub)
        .map(String)
        .map(async (pub) => {
          const existing = (await this.getOrNull(pub)) || [];
          prevRecords = prevRecords.concat(existing);
          await this.put(pub, existing.concat(recordsByPub[pub]));
        })
    );
    // Indexation
    await this.indexForExpiresOn.onInsert(records, prevRecords);
    await this.indexForRevokesOn.onInsert(records, prevRecords);
    await this.indexForWrittenOn.onInsert(records);
  }

  /**
   * Reduceable DAO
   */

  async trimRecords(belowNumber: number): Promise<void> {
    // Trim writtenOn: we remove from the index the blocks below `belowNumber`, and keep track of the deleted values
    const pubkeys: string[] = Underscore.uniq(
      await this.indexForWrittenOn.deleteBelow(belowNumber)
    );
    // For each entry, we trim the records of our INDEX
    await Promise.all(
      pubkeys.map(async (pub) => {
        const oldEntries = await this.get(pub);
        const newEntries = reduceForDBTrimming(oldEntries, belowNumber);
        await this.put(pub, newEntries);
      })
    );
    await this.indexForExpiresOn.onTrimming(belowNumber);
    await this.indexForRevokesOn.onTrimming(belowNumber);
  }

  /**
   * Generic DAO
   */

  async findRawWithOrder(
    criterion: { pub?: string },
    sort: (string | (string | boolean)[])[]
  ): Promise<MindexEntry[]> {
    const rows: MindexEntry[] = (await this.findAllValues()).reduce(
      reduceConcat,
      []
    );
    return Underscore.sortBy(
      rows,
      (r) => `${String(r.writtenOn).padStart(10, "0")}-${r.pub}`
    );
  }

  async getWrittenOn(blockstamp: string): Promise<MindexEntry[]> {
    const ids =
      (await this.indexForWrittenOn.getWrittenOnKeys(pint(blockstamp))) || [];
    return (await Promise.all(ids.map((id) => this.get(id))))
      .reduce(reduceConcat, [])
      .filter((e) => e.written_on === blockstamp);
  }

  async removeBlock(blockstamp: string): Promise<void> {
    // Trim writtenOn: we remove from the index the blocks below `belowNumber`, and keep track of the deleted values
    let newStateRecords: MindexEntry[] = [];
    const writteOn = pint(blockstamp);
    const pubkeys: string[] = Underscore.uniq(
      await this.indexForWrittenOn.deleteAt(writteOn)
    );
    let removedRecords: MindexEntry[] = [];
    // For each entry, we trim the records of our INDEX
    await Promise.all(
      pubkeys.map(async (pub) => {
        const records = await this.get(pub);
        const keptRecords = records.filter((e) => e.written_on !== blockstamp);
        removedRecords = removedRecords.concat(
          records.filter((e) => e.written_on === blockstamp)
        );
        newStateRecords = newStateRecords.concat(keptRecords);
        await this.put(pub, keptRecords);
      })
    );
    // Update indexes
    await this.indexForExpiresOn.onRemove(removedRecords, newStateRecords);
    await this.indexForRevokesOn.onRemove(removedRecords, newStateRecords);
  }

  //------------- DAO QUERIES --------------

  async findByPubAndChainableOnGt(
    pub: string,
    medianTime: number
  ): Promise<MindexEntry[]> {
    return (await this.reducable(pub)).filter(
      (e) => e.chainable_on && e.chainable_on > medianTime
    );
  }

  async findExpiresOnLteAndRevokesOnGt(medianTime: number): Promise<string[]> {
    return this.indexForExpiresOn.findExpiresOnLte(medianTime);
  }

  async findPubkeysThatShouldExpire(
    medianTime: number
  ): Promise<{ pub: string; created_on: string }[]> {
    const results: { pub: string; created_on: string }[] = [];
    const pubkeys = await this.findExpiresOnLteAndRevokesOnGt(medianTime);
    for (const pub of pubkeys) {
      const MS = (await this.getReducedMS(pub)) as FullMindexEntry; // We are sure because `memberships` already comes from the MINDEX
      const hasRenewedSince = MS.expires_on > medianTime;
      if (!MS.expired_on && !hasRenewedSince) {
        results.push({
          pub: MS.pub,
          created_on: MS.created_on,
        });
      }
    }
    return results;
  }

  async findRevokesOnLteAndRevokedOnIsNull(
    medianTime: number
  ): Promise<string[]> {
    return this.indexForRevokesOn.findRevokesOnLte(medianTime);
  }

  async getReducedMS(pub: string): Promise<FullMindexEntry | null> {
    const reducable = await this.reducable(pub);
    return reduceOrNull(reducable) as FullMindexEntry;
  }

  async getReducedMSForImplicitRevocation(
    pub: string
  ): Promise<FullMindexEntry | null> {
    return this.getReducedMS(pub);
  }

  async getRevokedPubkeys(): Promise<string[]> {
    return this.findWhereTransform(
      (v) => !!reduce(v).revoked_on,
      (kv) => kv.key
    );
  }

  async reducable(pub: string): Promise<MindexEntry[]> {
    return (await this.getOrNull(pub)) || [];
  }
}
