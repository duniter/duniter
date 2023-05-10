import {MonitorExecutionTime} from "../../../debug/MonitorExecutionTime";
import {FullSindexEntry, Indexer, SimpleTxEntryForWallet, SimpleTxInput, SindexEntry,} from "../../../indexer";
import {LevelUp} from "levelup";
import {LevelDBTable} from "./LevelDBTable";
import {SIndexDAO} from "../abstract/SIndexDAO";
import {Underscore} from "../../../common-libs/underscore";
import {pint} from "../../../common-libs/pint";
import {arrayPruneAllCopy} from "../../../common-libs/array-prune";
import {CommonConstants} from "../../../common-libs/constants";

export class LevelDBSindex extends LevelDBTable<SindexEntry>
  implements SIndexDAO {
  private indexForTrimming: LevelDBTable<string[]>;
  private indexForConsumed: LevelDBTable<string[]>;
  private indexForConditions: LevelDBTable<string[]>;
  private indexOfComplexeConditionForPubkeys: LevelDBTable<string[]>;

  constructor(protected getLevelDB: (dbName: string) => Promise<LevelUp>) {
    super("level_sindex", getLevelDB);
  }

  /**
   * TECHNICAL
   */

  async init(): Promise<void> {
    await super.init();
    this.indexForTrimming = new LevelDBTable<string[]>(
      "level_sindex/written_on",
      this.getLevelDB
    );
    this.indexForConsumed = new LevelDBTable<string[]>(
      "level_sindex/consumed_on",
      this.getLevelDB
    );
    this.indexForConditions = new LevelDBTable<string[]>(
      "level_sindex/conditions",
      this.getLevelDB
    );
    this.indexOfComplexeConditionForPubkeys = new LevelDBTable<string[]>(
        "level_sindex/complex_condition_pubkeys",
        this.getLevelDB
    );
    await this.indexForTrimming.init();
    await this.indexForConsumed.init();
    await this.indexForConditions.init();
    await this.indexOfComplexeConditionForPubkeys.init();
  }

  async close(): Promise<void> {
    await super.close();
    await this.indexForTrimming.close();
    await this.indexForConsumed.close();
    await this.indexForConditions.close();
    await this.indexOfComplexeConditionForPubkeys.close();
  }

  /**
   * INSERT
   */

  @MonitorExecutionTime()
  async insert(record: SindexEntry): Promise<void> {
    await this.insertBatch([record]);
  }

  @MonitorExecutionTime()
  async insertBatch(records: SindexEntry[]): Promise<void> {
    await this.batchInsertWithKeyComputing(records, (r) => {
      return LevelDBSindex.trimKey(r.identifier, r.pos, r.consumed);
    });
    await this.indexRecords(records);
  }

  findByIdentifier(identifier: string): Promise<SindexEntry[]> {
    return this.findAllValues({
      gte: identifier,
      lt: LevelDBSindex.upperIdentifier(identifier),
    });
  }

  findByIdentifierAndPos(
    identifier: string,
    pos: number
  ): Promise<SindexEntry[]> {
    return this.findAllValues({
      gte: LevelDBSindex.trimPartialKey(identifier, pos),
      lt: LevelDBSindex.upperIdentifier(
        LevelDBSindex.trimPartialKey(identifier, pos)
      ),
    });
  }

  // Not used by the protocol: we can accept a full scan
  async findByPos(pos: number): Promise<SindexEntry[]> {
    return (await this.findAllValues()).filter((r) => r.pos === pos);
  }

  async findTxSourceByIdentifierPosAmountBase(
    identifier: string,
    pos: number,
    amount: number,
    base: number
  ): Promise<SimpleTxInput[]> {
    return (await this.findByIdentifier(identifier)).filter(
      (r) => r.pos === pos && r.amount === amount && r.base === base
    );
  }

  async getAvailableForConditions(
    conditionsStr: string
  ): Promise<SindexEntry[]> {
    const forConditions = await this.getForConditions(conditionsStr);
    const reduced = Indexer.DUP_HELPERS.reduceBy(forConditions, [
      "identifier",
      "pos",
    ]);
    return reduced.filter((r) => !r.consumed);
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
    const forConditions = await this.getForConditions(`SIG(${pubkey})`);
    const forPubkeys = await this.getForComplexeConditionPubkey(pubkey);
    const reduced = Indexer.DUP_HELPERS.reduceBy(forConditions.concat(forPubkeys), [
      "identifier",
      "pos",
    ]);
    return reduced.filter((r) => !r.consumed);
  }

  async getTxSource(
    identifier: string,
    pos: number
  ): Promise<FullSindexEntry | null> {
    const entries = await this.findByIdentifierAndPos(identifier, pos);
    return Indexer.DUP_HELPERS.reduceOrNull(entries);
  }

  async getWrittenOnTxs(blockstamp: string): Promise<SimpleTxEntryForWallet[]> {
    const writtenOn = await this.getWrittenOn(blockstamp);
    const entries: SimpleTxEntryForWallet[] = [];
    writtenOn.forEach((w) => {
      entries.push({
        srcType: "T",
        op: w.op,
        conditions: w.conditions,
        amount: w.amount,
        base: w.base,
        identifier: w.identifier,
        pos: w.pos,
      });
    });
    return entries;
  }

  async trimConsumedSource(belowNumber: number): Promise<void> {
    let belowNumberIds: string[] = [];
    const mapIds: {
      [k: string]: {
        conditions: string;
        writtenOn: number;
      };
    } = {};
    const mapIds2WrittenOn: { [k: string]: number } = {};

    // First: we look at what was written before `belowNumber`
    await this.indexForConsumed.readAllKeyValue(
      async (kv) => {
        belowNumberIds = belowNumberIds.concat(kv.value);
        for (const id of kv.value) {
          mapIds2WrittenOn[id] = pint(kv.key);
        }
      },
      {
        lt: LevelDBSindex.trimWrittenOnKey(belowNumber),
      }
    );

    // Second: we identify the corresponding **consumed** sources and remove them.
    for (const id of belowNumberIds) {
      // Remove consumed sources
      const identifier = id.split("-")[0];
      const pos = pint(id.split("-")[1]);
      const entry = await this.getOrNull(
        LevelDBSindex.trimKey(identifier, pos, true)
      );
      if (entry && entry.writtenOn < belowNumber) {
        // We remember the trimmed source id to remove it from the writtenOn and conditions index
        mapIds[id] = {
          writtenOn: mapIds2WrittenOn[id],
          conditions: entry.conditions,
        };
        await this.del(LevelDBSindex.trimKey(identifier, pos, false));
        await this.del(LevelDBSindex.trimKey(identifier, pos, true));
      }
    }

    // We update indexes
    for (const id of Underscore.keys(mapIds).map(String)) {
      const map = mapIds[id];
      await this.trimConditions(map.conditions, id);
      await this.trimConsumed(map.writtenOn, id);
      await this.trimWrittenOn(map.writtenOn, id);
    }
  }

  /**
   * Reduceable DAO
   */

  trimRecords(belowNumber: number): Promise<void> {
    return this.trimConsumedSource(belowNumber);
  }

  /**
   * Generic DAO
   */

  async findRawWithOrder(
    criterion: { pub?: string },
    sort: (string | (string | boolean)[])[]
  ): Promise<SindexEntry[]> {
    const rows = await this.findAllValues();
    return Underscore.sortBy(
      rows,
      (r) => 1000 * r.writtenOn + (r.consumed ? 1 : 0)
    );
  }

  async getWrittenOn(blockstamp: string): Promise<SindexEntry[]> {
    const ids = Underscore.uniq(
      (await this.indexForTrimming.getOrNull(
        LevelDBSindex.trimWrittenOnKey(pint(blockstamp))
      )) || []
    );
    const found: SindexEntry[] = [];
    for (const id of ids) {
      const entries = await this.findByIdentifierAndPos(
        id.split("-")[0],
        pint(id.split("-")[1])
      );
      entries
        .filter((e) => e.written_on === blockstamp)
        .forEach((e) => found.push(e));
    }
    return found;
  }

  async getForConditions(conditions: string): Promise<SindexEntry[]> {
    const ids = (await this.indexForConditions.getOrNull(conditions)) || [];
    const found: SindexEntry[] = [];
    for (const id of ids) {
      const entries = await this.findByIdentifierAndPos(
        id.split("-")[0],
        pint(id.split("-")[1])
      );
      entries.forEach((e) => found.push(e));
    }
    return found;
  }

  async getForComplexeConditionPubkey(pubkey: string): Promise<SindexEntry[]> {
    const ids = (await this.indexOfComplexeConditionForPubkeys.getOrNull(pubkey)) || [];
    const found: SindexEntry[] = [];
    for (const id of ids) {
      const entries = await this.findByIdentifierAndPos(
          id.split("-")[0],
          pint(id.split("-")[1])
      );
      entries.forEach((e) => found.push(e));
    }
    return found;
  }

  async removeBlock(blockstamp: string): Promise<void> {
    const writtenOn = pint(blockstamp);
    // We look at records written on this blockstamp: `indexForTrimming` allows to get them
    const ids =
      (await this.indexForTrimming.getOrNull(
        LevelDBSindex.trimWrittenOnKey(writtenOn)
      )) || [];
    // `ids` contains both CREATE and UPDATE sources
    for (const id of ids) {
      // Remove sources
      const identifier = id.split("-")[0];
      const pos = parseInt(id.split("-")[1]);
      const conditions: string[] = [];
      const createKey = LevelDBSindex.trimKey(identifier, pos, false);
      const updateKey = LevelDBSindex.trimKey(identifier, pos, true);
      const createRecord = await this.getOrNull(createKey);
      const updateRecord = await this.getOrNull(updateKey);
      // Undo consumption
      if (updateRecord && updateRecord.writtenOn === writtenOn) {
        conditions.push(updateRecord.conditions);
        await this.del(updateKey);
      }
      // Undo creation?
      if (createRecord && createRecord.writtenOn === writtenOn) {
        conditions.push(createRecord.conditions);
        await this.del(createKey);
      }
      // Update balance
      // 1. Conditions
      const uniqConditions = Underscore.uniq(conditions);
      for (const condition of uniqConditions) {
        // Remove this source from the balance
        await this.trimConditions(condition, id);
      }
    }
    if (ids.length) {
      // 2. WrittenOn
      await this.indexForTrimming.del(
        LevelDBSindex.trimWrittenOnKey(writtenOn)
      );
      await this.indexForConsumed.del(
        LevelDBSindex.trimWrittenOnKey(writtenOn)
      );
    }
  }

  private async trimConditions(condition: string, id: string) {
    // Get all the condition's sources
    const existing = (await this.indexForConditions.getOrNull(condition)) || [];
    // Prune the source from the condition
    const trimmed = arrayPruneAllCopy(existing, id);
    if (trimmed.length) {
      // If some sources are left for this "condition", persist what remains
      await this.indexForConditions.put(condition, trimmed);
    } else {
      // Otherwise just delete the "account"
      await this.indexForConditions.del(condition);
    }

    // If complex conditions
    if (this.isComplexCondition(condition)) {
      const pubkeys = this.getDistinctPubkeysFromCondition(condition);
      await this.trimComplexeConditionPubkeys(pubkeys, id);
    }
  }

  private async trimWrittenOn(writtenOn: number, id: string) {
    const k = LevelDBSindex.trimWrittenOnKey(writtenOn);
    const existing = await this.getWrittenOnSourceIds(writtenOn);
    const trimmed = arrayPruneAllCopy(existing, id);
    if (trimmed.length) {
      await this.indexForConditions.put(k, trimmed);
    } else {
      await this.indexForConditions.del(k);
    }
  }

  private async trimConsumed(writtenOn: number, id: string) {
    const k = LevelDBSindex.trimWrittenOnKey(writtenOn);
    const existing = (await this.indexForConsumed.getOrNull(k)) || [];
    const trimmed = arrayPruneAllCopy(existing, id);
    if (trimmed.length) {
      await this.indexForConsumed.put(k, trimmed);
    } else {
      await this.indexForConsumed.del(k);
    }
  }

  private async trimComplexeConditionPubkeys(pubkeys: string[], id: string) {
    if (!pubkeys || !pubkeys.length) return;
    for (const p of pubkeys) {
      await this.trimComplexeConditionPubkey(p, id);
    }
  }

  private async trimComplexeConditionPubkey(pubkey: string, id: string) {
    // Get all the condition's sources
    const existing = (await this.indexOfComplexeConditionForPubkeys.getOrNull(pubkey)) || [];
    // Prune the source from the condition
    const trimmed = arrayPruneAllCopy(existing, id);
    if (trimmed.length) {
      // If some sources are left for this "condition", persist what remains
      await this.indexOfComplexeConditionForPubkeys.put(pubkey, trimmed);
    } else {
      // Otherwise just delete the "account"
      await this.indexOfComplexeConditionForPubkeys.del(pubkey);
    }
  }

  private async getWrittenOnSourceIds(writtenOn: number) {
    const indexForTrimmingId = LevelDBSindex.trimWrittenOnKey(writtenOn);
    return (await this.indexForTrimming.getOrNull(indexForTrimmingId)) || [];
  }

  private static trimKey(identifier: string, pos: number, consumed: boolean) {
    return `${identifier}-${String(pos).padStart(10, "0")}-${consumed ? 1 : 0}`;
  }

  private static trimWrittenOnKey(writtenOn: number) {
    return String(writtenOn).padStart(10, "0");
  }

  private static trimPartialKey(identifier: string, pos: number) {
    return `${identifier}-${String(pos).padStart(10, "0")}`;
  }

  public static upperIdentifier(identifier: string) {
    let indexOfLastNonFletter = identifier.length - 1;
    let nextLastLetter = String.fromCharCode(
      identifier.charCodeAt(indexOfLastNonFletter) + 1
    );
    // We only use 0-9A-G notation
    if (nextLastLetter === ":") {
      nextLastLetter = "A";
    }
    return (
      identifier.substr(0, indexOfLastNonFletter) +
      nextLastLetter +
      identifier.substr(indexOfLastNonFletter + 1)
    );
  }

  private async indexRecords(records: SindexEntry[]) {
    const byConsumed: { [k: number]: SindexEntry[] } = {};
    const byWrittenOn: { [k: number]: SindexEntry[] } = {};
    const byConditions: { [k: string]: SindexEntry[] } = {};
    const byPubkeys: { [k: string]: SindexEntry[] } = {};
    records
      .filter((r) => r.consumed)
      .forEach((r) => {
        // WrittenOn consumed
        let arrConsumed = byConsumed[r.writtenOn];
        if (!arrConsumed) {
          arrConsumed = byConsumed[r.writtenOn] = [];
        }
        arrConsumed.push(r);
      });
    records.forEach((r) => {
      // WrittenOn
      let arrWO = byWrittenOn[r.writtenOn];
      if (!arrWO) {
        arrWO = byWrittenOn[r.writtenOn] = [];
      }
      arrWO.push(r);
      // Conditions
      let arrCN = byConditions[r.conditions];
      if (!arrCN) {
        arrCN = byConditions[r.conditions] = [];
      }
      arrCN.push(r);

      // If complex condition
      if (this.isComplexCondition(r.conditions)) {
        const pubkeys = this.getDistinctPubkeysFromCondition(r.conditions);
        pubkeys.forEach((pub) => {
          let arrPub = byPubkeys[pub];
          if (!arrPub) {
            arrPub = byPubkeys[pub] = [];
          }
          arrPub.push(r);
        });
      }
    });
    // Index consumed => (identifier + pos)[]
    for (const k of Underscore.keys(byConsumed)) {
      await this.indexForConsumed.put(
        LevelDBSindex.trimWrittenOnKey(k),
        byConsumed[k].map((r) =>
          LevelDBSindex.trimPartialKey(r.identifier, r.pos)
        )
      );
    }
    // Index writtenOn => (identifier + pos)[]
    for (const k of Underscore.keys(byWrittenOn)) {
      await this.indexForTrimming.put(
        LevelDBSindex.trimWrittenOnKey(k),
        byWrittenOn[k].map((r) =>
          LevelDBSindex.trimPartialKey(r.identifier, r.pos)
        )
      );
    }
    // Index conditions => (identifier + pos)[]
    for (const k of Underscore.keys(byConditions).map(String)) {
      const existing = (await this.indexForConditions.getOrNull(k)) || [];
      const newSources = byConditions[k].map((r) =>
        LevelDBSindex.trimPartialKey(r.identifier, r.pos)
      );
      await this.indexForConditions.put(
        k,
        Underscore.uniq(existing.concat(newSources))
      );
    }
    // Index pubkeys => (identifier + pos)[]
    for (const k of Underscore.keys(byPubkeys).map(String)) {
      const existing = (await this.indexOfComplexeConditionForPubkeys.getOrNull(k)) || [];
      const newSources = byPubkeys[k].map((r) =>
          LevelDBSindex.trimPartialKey(r.identifier, r.pos)
      );
      await this.indexOfComplexeConditionForPubkeys.put(
          k,
          Underscore.uniq(existing.concat(newSources))
      );
    }
  }

  private isComplexCondition(condition: string): boolean {
    return condition && !CommonConstants.TRANSACTION.OUTPUT_CONDITION_SIG_PUBKEY_UNIQUE.test(condition) || false;
  }
  /**
   * Get all pubkeys used by an output condition (e.g. 'SIG(A) && SIG(B)' will return ['A', 'B']
   * @param condition
   * @private
   */
  private getDistinctPubkeysFromCondition(condition: string): string[] {
    const pubKeys: string[] = [];
    if (!condition) return pubKeys;
    let match: RegExpExecArray | null;
    while ((match = CommonConstants.TRANSACTION.OUTPUT_CONDITION_SIG_PUBKEY.exec(condition)) !== null) {
      pubKeys.push(match[1]);
      condition = condition.substring(match.index + match[0].length);
    }

    return Underscore.uniq(pubKeys);
  }
}
