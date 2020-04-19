import { MonitorExecutionTime } from "../../../debug/MonitorExecutionTime";
import { LevelUp } from "levelup";
import { LevelDBTable } from "./LevelDBTable";
import { DBBlock } from "../../../db/DBBlock";
import { BlockchainDAO } from "../abstract/BlockchainDAO";
import { LevelIndexBlockIdentities } from "./indexers/block/LevelIndexBlockIdentities";
import { uniqFilter } from "../../../common-libs/array-filter";
import { LevelIndexBlockCertifications } from "./indexers/block/LevelIndexBlockCertifications";
import {
  LDBIndex_ALL,
  LevelIndexBlock,
} from "./indexers/block/LevelIndexBlock";
import { NewLogger } from "../../../logger";
import { LevelIndexBlockTX } from "./indexers/block/LevelIndexBlockTX";
import { LevelIndexBlockUD } from "./indexers/block/LevelIndexBlockUD";
import { LevelIndexBlockRevoked } from "./indexers/block/LevelIndexBlockRevoked";
import { LevelIndexBlockExcluded } from "./indexers/block/LevelIndexBlockExcluded";
import { LevelIndexBlockJoiners } from "./indexers/block/LevelIndexBlockJoiners";
import { LevelIndexBlockActives } from "./indexers/block/LevelIndexBlockActives";
import { LevelIndexBlockLeavers } from "./indexers/block/LevelIndexBlockLeavers";

export class LevelDBBlockchain extends LevelDBTable<DBBlock>
  implements BlockchainDAO {
  private forks: LevelDBTable<DBBlock>;
  private indexOfIdentities: LevelIndexBlock;
  private indexOfCertifications: LevelIndexBlock;
  private indexOfJoiners: LevelIndexBlock;
  private indexOfActives: LevelIndexBlock;
  private indexOfLeavers: LevelIndexBlock;
  private indexOfExcluded: LevelIndexBlock;
  private indexOfRevoked: LevelIndexBlock;
  private indexOfDividends: LevelIndexBlock;
  private indexOfTransactions: LevelIndexBlock;
  private indexers: LevelIndexBlock[] = [];

  constructor(protected getLevelDB: (dbName: string) => Promise<LevelUp>) {
    super("level_blockchain", getLevelDB);
  }

  async init(): Promise<void> {
    await super.init();
    if (this.indexers.length === 0) {
      this.forks = new LevelDBTable<DBBlock>(
        "level_blockchain/forks",
        this.getLevelDB
      );
      this.indexers.push(
        (this.indexOfIdentities = new LevelIndexBlockIdentities(
          "level_blockchain/idty",
          this.getLevelDB
        ))
      );
      this.indexers.push(
        (this.indexOfCertifications = new LevelIndexBlockCertifications(
          "level_blockchain/certs",
          this.getLevelDB
        ))
      );
      this.indexers.push(
        (this.indexOfJoiners = new LevelIndexBlockJoiners(
          "level_blockchain/joiners",
          this.getLevelDB
        ))
      );
      this.indexers.push(
        (this.indexOfActives = new LevelIndexBlockActives(
          "level_blockchain/actives",
          this.getLevelDB
        ))
      );
      this.indexers.push(
        (this.indexOfLeavers = new LevelIndexBlockLeavers(
          "level_blockchain/leavers",
          this.getLevelDB
        ))
      );
      this.indexers.push(
        (this.indexOfExcluded = new LevelIndexBlockExcluded(
          "level_blockchain/excluded",
          this.getLevelDB
        ))
      );
      this.indexers.push(
        (this.indexOfRevoked = new LevelIndexBlockRevoked(
          "level_blockchain/revoked",
          this.getLevelDB
        ))
      );
      this.indexers.push(
        (this.indexOfDividends = new LevelIndexBlockUD(
          "level_blockchain/dividends",
          this.getLevelDB
        ))
      );
      this.indexers.push(
        (this.indexOfTransactions = new LevelIndexBlockTX(
          "level_blockchain/transactions",
          this.getLevelDB
        ))
      );
    }
    await this.forks.init();
    NewLogger().debug(`Now open indexers...`);
    await Promise.all(this.indexers.map((i) => i.init()));
  }

  async close(): Promise<void> {
    await super.close();
    await this.forks.close();
    await Promise.all(this.indexers.map((i) => i.close()));
  }

  /**
   * INSERT
   */

  @MonitorExecutionTime()
  async insert(record: DBBlock): Promise<void> {
    await this.insertBatch([record]);
  }

  @MonitorExecutionTime()
  async insertBatch(records: DBBlock[]): Promise<void> {
    // Indexation
    await Promise.all(this.indexers.map((i) => i.onInsert(records)));
    // Update the max headNumber
    await this.batchInsertWithKeyComputing(records, (r) => {
      return LevelDBBlockchain.trimKey(r.number);
    });
  }

  async dropNonForkBlocksAbove(number: number): Promise<void> {
    await this.applyAllKeyValue(
      async (kv) => {
        // console.log(`DROPPING FORK ${kv.key}`)
        return this.del(kv.key);
      },
      {
        gt: LevelDBBlockchain.trimKey(number),
      }
    );
  }

  // Never used
  async findRawWithOrder(
    criterion: { pub?: string },
    sort: (string | (string | boolean)[])[]
  ): Promise<DBBlock[]> {
    return [];
  }

  async getAbsoluteBlock(
    number: number,
    hash: string
  ): Promise<DBBlock | null> {
    const block = await this.getBlock(number);
    if (block && block.hash === hash) {
      return block;
    }
    const fork = await this.forks.getOrNull(
      LevelDBBlockchain.trimForkKey(number, hash)
    );
    if (!fork) {
      return null;
    }
    fork.fork = true;
    return fork;
  }

  getBlock(number: string | number): Promise<DBBlock | null> {
    return this.getOrNull(LevelDBBlockchain.trimKey(parseInt(String(number))));
  }

  getBlocks(start: number, end: number): Promise<DBBlock[]> {
    return this.findAllValues({
      gt: LevelDBBlockchain.trimKey(start - 1),
      lt: LevelDBBlockchain.trimKey(end + 1),
    });
  }

  // Used by DuniterUI
  async getCountOfBlocksIssuedBy(issuer: string): Promise<number> {
    let nb = 0;
    await this.readAllKeyValue((kv) => {
      if (kv.value.issuer === issuer) {
        nb++;
      }
    });
    return nb;
  }

  async getCurrent(): Promise<DBBlock | null> {
    return (
      await this.findAllValues({
        limit: 1,
        reverse: true,
      })
    )[0];
  }

  async getNextForkBlocks(number: number, hash: string): Promise<DBBlock[]> {
    const potentialForks = await this.findBetween(
      this.forks,
      number + 1,
      number + 1
    );
    return potentialForks.filter((f) => f.previousHash === hash);
  }

  async getPotentialForkBlocks(
    numberStart: number,
    medianTimeStart: number,
    maxNumber: number
  ): Promise<DBBlock[]> {
    const potentialForks = await this.findBetween(
      this.forks,
      numberStart,
      maxNumber
    );
    return potentialForks.filter((f) => f.medianTime >= medianTimeStart);
  }

  getPotentialRoots(): Promise<DBBlock[]> {
    return this.findBetween(this.forks, 0, 0);
  }

  // TODO: potentially never called?
  async getWrittenOn(blockstamp: string): Promise<DBBlock[]> {
    const number = parseInt(blockstamp);
    const blocks = await this.findBetween(this.forks, number, number);
    const block = await this.getOrNull(
      LevelDBBlockchain.trimKey(parseInt(blockstamp))
    );
    return block ? blocks.concat(block) : blocks;
  }

  // TODO: Unused? potentially costly because of full scan
  async lastBlockOfIssuer(issuer: string): Promise<DBBlock | null> {
    let theLast: DBBlock | null = null;
    await this.readAllKeyValue((kv) => {
      if (!theLast && kv.value.issuer === issuer) {
        theLast = kv.value;
      }
    });
    return theLast;
  }

  // TODO: Unused? potentially costly because of full scan
  async lastBlockWithDividend(): Promise<DBBlock | null> {
    let theLast: DBBlock | null = null;
    await this.readAllKeyValue((kv) => {
      if (!theLast && kv.value.dividend) {
        theLast = kv.value;
      }
    });
    return theLast;
  }

  async removeBlock(blockstamp: string): Promise<void> {
    await this.del(LevelDBBlockchain.trimKey(parseInt(blockstamp)));
  }

  async removeForkBlock(number: number): Promise<void> {
    await this.forks.applyAllKeyValue(async (kv) => this.forks.del(kv.key), {
      gt: LevelDBBlockchain.trimKey(number - 1),
      lt: LevelDBBlockchain.trimKey(number + 1),
    });
  }

  async removeForkBlockAboveOrEqual(number: number): Promise<void> {
    await this.forks.applyAllKeyValue(async (kv) => this.forks.del(kv.key), {
      gt: LevelDBBlockchain.trimKey(number - 1),
    });
  }

  async saveBlock(block: DBBlock): Promise<DBBlock> {
    // We add the new block into legit blockchain
    await this.insert(block);
    block.fork = false;
    // We remove the eventual fork
    const forkKey = LevelDBBlockchain.trimForkKey(block.number, block.hash);
    if (this.forks.getOrNull(forkKey)) {
      await this.forks.del(forkKey);
    }
    // We return the saved block
    return this.get(LevelDBBlockchain.trimKey(block.number));
  }

  async saveSideBlock(block: DBBlock): Promise<DBBlock> {
    const k = LevelDBBlockchain.trimForkKey(block.number, block.hash);
    block.fork = true;
    await this.forks.put(k, block);
    return this.forks.get(k);
  }

  async setSideBlock(
    number: number,
    previousBlock: DBBlock | null
  ): Promise<void> {
    const k = LevelDBBlockchain.trimKey(number);
    const block = await this.get(k);
    block.fork = true;
    // Indexation
    await Promise.all(this.indexers.map((i) => i.onRemove([block])));
    await this.del(k);
    await this.forks.put(
      LevelDBBlockchain.trimForkKey(block.number, block.hash),
      block
    );
  }

  async findBetween(
    db: LevelDBTable<DBBlock>,
    start: number,
    end: number
  ): Promise<DBBlock[]> {
    return await db.findAllValues({
      gte: LevelDBBlockchain.trimKey(start),
      lt: LevelDBBlockchain.trimKey(end + 1),
    });
  }

  async findWithIdentities(): Promise<number[]> {
    return this.findIndexed(this.indexOfIdentities);
  }

  async findWithCertifications(): Promise<number[]> {
    return this.findIndexed(this.indexOfCertifications);
  }

  async findWithJoiners(): Promise<number[]> {
    return this.findIndexed(this.indexOfJoiners);
  }

  async findWithActives(): Promise<number[]> {
    return this.findIndexed(this.indexOfActives);
  }

  async findWithLeavers(): Promise<number[]> {
    return this.findIndexed(this.indexOfLeavers);
  }

  async findWithExcluded(): Promise<number[]> {
    return this.findIndexed(this.indexOfExcluded);
  }

  async findWithRevoked(): Promise<number[]> {
    return this.findIndexed(this.indexOfRevoked);
  }

  async findWithUD(): Promise<number[]> {
    return this.findIndexed(this.indexOfDividends);
  }

  async findWithTXs(): Promise<number[]> {
    return this.findIndexed(this.indexOfTransactions);
  }

  private async findIndexed(indexer: LevelIndexBlock): Promise<number[]> {
    const found = await indexer.getOrNull(LDBIndex_ALL);
    if (!found) {
      // When the entry does not exist (may occur for 'ALL' key)
      return [];
    }
    // Otherwise: return the records
    return Promise.all(
      found
        .reduce((all, some) => all.concat(some), [] as number[])
        .filter(uniqFilter)
        .sort((b, a) => b - a)
    );
  }

  private static trimKey(number: number) {
    return String(number).padStart(10, "0");
  }

  private static trimForkKey(number: number, hash: string) {
    return `${String(number).padStart(10, "0")}-${hash}`;
  }
}
