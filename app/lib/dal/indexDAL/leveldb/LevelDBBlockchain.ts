import {MonitorExecutionTime} from "../../../debug/MonitorExecutionTime"
import {LevelUp} from 'levelup'
import {LevelDBTable} from "./LevelDBTable"
import {DBBlock} from "../../../db/DBBlock"
import {BlockchainDAO} from "../abstract/BlockchainDAO"

export class LevelDBBlockchain extends LevelDBTable<DBBlock> implements BlockchainDAO {

  private forks: LevelDBTable<DBBlock>

  constructor(protected getLevelDB: (dbName: string)=> Promise<LevelUp>) {
    super('level_blockchain', getLevelDB)
  }

  async init(): Promise<void> {
    await super.init()
    this.forks = new LevelDBTable<DBBlock>('level_blockchain/forks', this.getLevelDB)
    await this.forks.init()
  }

  async close(): Promise<void> {
    await super.close()
    await this.forks.close()
  }

  /**
   * INSERT
   */

  @MonitorExecutionTime()
  async insert(record: DBBlock): Promise<void> {
    await this.insertBatch([record])
  }

  @MonitorExecutionTime()
  async insertBatch(records: DBBlock[]): Promise<void> {
    // Update the max headNumber
    await this.batchInsertWithKeyComputing(records, r => {
      return LevelDBBlockchain.trimKey(r.number)
    })
  }

  async dropNonForkBlocksAbove(number: number): Promise<void> {
    await this.applyAllKeyValue(async kv => {
      // console.log(`DROPPING FORK ${kv.key}`)
      return this.del(kv.key)
    }, {
      gt: LevelDBBlockchain.trimKey(number)
    })
  }

  // Never used
  async findRawWithOrder(criterion: { pub?: string }, sort: (string | (string | boolean)[])[]): Promise<DBBlock[]> {
    return []
  }

  async getAbsoluteBlock(number: number, hash: string): Promise<DBBlock | null> {
    const block = await this.getBlock(number)
    if (block && block.hash === hash) {
      return block
    }
    const fork = await this.forks.getOrNull(LevelDBBlockchain.trimForkKey(number, hash))
    if (!fork) {
      return null
    }
    fork.fork = true
    return fork
  }

  getBlock(number: string | number): Promise<DBBlock | null> {
    return this.getOrNull(LevelDBBlockchain.trimKey(parseInt(String(number))))
  }

  getBlocks(start: number, end: number): Promise<DBBlock[]> {
    return this.findAllValues({
      gt: LevelDBBlockchain.trimKey(start - 1),
      lt: LevelDBBlockchain.trimKey(end + 1)
    })
  }

  // Used by DuniterUI
  async getCountOfBlocksIssuedBy(issuer: string): Promise<number> {
    let nb = 0
    await this.readAllKeyValue(kv => {
      if (kv.value.issuer === issuer) {
        nb++
      }
    })
    return nb
  }

  async getCurrent(): Promise<DBBlock | null> {
    return (await this.findAllValues({
      limit: 1,
      reverse: true
    }))[0]
  }

  async getNextForkBlocks(number: number, hash: string): Promise<DBBlock[]> {
    const potentialForks = await this.findBetween(this.forks, number + 1, number + 1)
    return potentialForks.filter(f => f.previousHash === hash)
  }


  async getPotentialForkBlocks(numberStart: number, medianTimeStart: number, maxNumber: number): Promise<DBBlock[]> {
    const potentialForks = await this.findBetween(this.forks, numberStart, maxNumber)
    return potentialForks.filter(f => f.medianTime >= medianTimeStart)
  }

  getPotentialRoots(): Promise<DBBlock[]> {
    return this.findBetween(this.forks, 0, 0)
  }

  // TODO: potentially never called?
  async getWrittenOn(blockstamp: string): Promise<DBBlock[]> {
    const number = parseInt(blockstamp)
    const blocks = await this.findBetween(this.forks, number, number)
    const block = await this.getOrNull(LevelDBBlockchain.trimKey(parseInt(blockstamp)))
    return block ? blocks.concat(block) : blocks
  }

  // TODO: Unused? potentially costly because of full scan
  async lastBlockOfIssuer(issuer: string): Promise<DBBlock | null> {
    let theLast: DBBlock | null = null
    await this.readAllKeyValue(kv => {
      if (!theLast && kv.value.issuer === issuer) {
        theLast = kv.value
      }
    })
    return theLast
  }

  // TODO: Unused? potentially costly because of full scan
  async lastBlockWithDividend(): Promise<DBBlock | null> {
    let theLast: DBBlock | null = null
    await this.readAllKeyValue(kv => {
      if (!theLast && kv.value.dividend) {
        theLast = kv.value
      }
    })
    return theLast
  }

  async removeBlock(blockstamp: string): Promise<void> {
    await this.del(LevelDBBlockchain.trimKey(parseInt(blockstamp)))
  }

  async removeForkBlock(number: number): Promise<void> {
    await this.forks.applyAllKeyValue(async kv => this.forks.del(kv.key), {
      gt: LevelDBBlockchain.trimKey(number - 1),
      lt: LevelDBBlockchain.trimKey(number + 1)
    })
  }

  async removeForkBlockAboveOrEqual(number: number): Promise<void> {
    await this.forks.applyAllKeyValue(async kv => this.forks.del(kv.key), {
      gt: LevelDBBlockchain.trimKey(number - 1)
    })
  }

  async saveBlock(block: DBBlock): Promise<DBBlock> {
    // We add the new block into legit blockchain
    await this.insert(block)
    block.fork = false
    // We remove the eventual fork
    const forkKey = LevelDBBlockchain.trimForkKey(block.number, block.hash)
    if (this.forks.getOrNull(forkKey)) {
      await this.forks.del(forkKey)
    }
    // We return the saved block
    return this.get(LevelDBBlockchain.trimKey(block.number))
  }

  async saveBunch(blocks: DBBlock[]): Promise<void> {
    blocks.forEach(b => b.fork = false)
    await this.insertBatch(blocks)
  }

  async saveSideBlock(block: DBBlock): Promise<DBBlock> {
    const k = LevelDBBlockchain.trimForkKey(block.number, block.hash)
    block.fork = true
    await this.forks.put(k, block)
    return this.forks.get(k)
  }

  async setSideBlock(number: number, previousBlock: DBBlock | null): Promise<void> {
    const k = LevelDBBlockchain.trimKey(number)
    const block = await this.get(k)
    block.fork = true
    await this.del(k)
    await this.forks.put(LevelDBBlockchain.trimForkKey(block.number, block.hash), block)
  }

  async findBetween(db: LevelDBTable<DBBlock>, start: number, end: number): Promise<DBBlock[]> {
    return await db.findAllValues({
      gte: LevelDBBlockchain.trimKey(start),
      lt: LevelDBBlockchain.trimKey(end + 1)
    })
  }

  private static trimKey(number: number) {
    return String(number).padStart(10, '0')
  }

  private static trimForkKey(number: number, hash: string) {
    return `${String(number).padStart(10, '0')}-${hash}`
  }
}
