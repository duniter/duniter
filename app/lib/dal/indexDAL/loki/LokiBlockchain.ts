import {LokiIndex} from "./LokiIndex"
import {NewLogger} from "../../../logger"
import {BlockchainDAO} from "../abstract/BlockchainDAO"
import {DBBlock} from "../../../db/DBBlock"
import {getMicrosecondsTime} from "../../../../ProcessCpuProfiler"

const logger = NewLogger()

export class LokiBlockchain extends LokiIndex<DBBlock> implements BlockchainDAO {

  private current:DBBlock|null = null

  constructor(loki:any) {
    super(loki, 'blockchain', ['number', 'hash', 'fork'])
  }

  cleanCache(): void {
    super.cleanCache()
    this.current = null
  }

  async getCurrent() {
    if (this.current) {
      // Cached
      return this.current
    } else {
      // Costly method, as a fallback
      return this.collection
        .chain()
        .find({
          fork: false
        })
        .simplesort('number', true)
        .data()[0]
    }
  }

  async getBlock(number:string | number) {
    const now = getMicrosecondsTime()
    const b = this.collection
      .chain()
      .find({
        number: parseInt(String(number)),
        fork: false
      })
      .data()[0]
    logger.trace('[loki][%s][getBlock] %sµs', this.collectionName, (getMicrosecondsTime() - now), number)
    return b
  }

  async getPotentialRoots() {
    return this.collection
      .chain()
      .find({ number: 0, fork: true })
      .data()
  }

  async saveBunch(blocks:DBBlock[]) {
    return this.insertBatch(blocks)
  }

  async insert(record: DBBlock): Promise<void> {
    return super.insert(record);
  }

  async removeBlock(blockstamp: string): Promise<void> {
    // Never remove blocks
  }

  async removeForkBlock(number:number): Promise<void> {
    await this.collection
      .chain()
      .find({
        fork: true,
        number
      })
      .remove()
  }

  async removeForkBlockAboveOrEqual(number:number): Promise<void> {
    await this.collection
      .chain()
      .find({
        fork: true,
        number: { $gte: number }
      })
      .remove()
  }

  async trimBlocks(number:number): Promise<void> {
    await this.collection
      .chain()
      .find({
        number: { $lte: number }
      })
      .remove()
  }

  async getAbsoluteBlock(number: number, hash: string): Promise<DBBlock | null> {
    return this.collection
      .chain()
      .find({
        number,
        hash
      })
      .data()[0]
  }

  async getBlocks(start: number, end: number): Promise<DBBlock[]> {
    return this.collection
      .chain()
      .find({
        number: { $between: [start, end] },
        fork: false
      })
      .simplesort('number')
      .data()
  }

  async getCountOfBlocksIssuedBy(issuer: string): Promise<number> {
    return this.collection
      .chain()
      .find({
        issuer,
        fork: false
      })
      .data()
      .length
  }

  async getNextForkBlocks(number: number, hash: string): Promise<DBBlock[]> {
    return this.collection
      .chain()
      .find({
        fork: true,
        number: number + 1,
        previousHash: hash
      })
      .simplesort('number')
      .data()
  }

  async getPotentialForkBlocks(numberStart: number, medianTimeStart: number, maxNumber: number): Promise<DBBlock[]> {
    return this.collection
      .chain()
      .find({
        fork: true,
        number: { $between: [numberStart, maxNumber] },
        medianTime: { $gte: medianTimeStart }
      })
      .simplesort('number', true)
      .data()
  }

  async lastBlockOfIssuer(issuer: string): Promise<DBBlock | null> {
    return this.collection
      .chain()
      .find({
        fork: false,
        issuer
      })
      .simplesort('number', true)
      .data()[0]
  }

  async lastBlockWithDividend(): Promise<DBBlock | null> {
    return this.collection
      .chain()
      .find({
        fork: false,
        dividend: { $gt: 0 }
      })
      .simplesort('number', true)
      .data()[0]
  }

  async saveBlock(block: DBBlock): Promise<DBBlock> {
    if (!this.current || this.current.number < block.number) {
      this.current = block;
    }
    return this.insertOrUpdate(block, false)
  }

  async saveSideBlock(block: DBBlock): Promise<DBBlock> {
    return this.insertOrUpdate(block, true)
  }

  async insertOrUpdate(block: DBBlock, isFork:boolean): Promise<DBBlock> {
    block.fork = isFork
    const conditions = { number: block.number, hash: block.hash }
    const existing = (await this.findRaw(conditions))[0]
    if (existing && existing.fork !== isFork) {
      // Existing block: we only allow to change the fork flag
      this.collection
        .chain()
        .find(conditions)
        .update(b => {
          b.fork = isFork
          b.monetaryMass = block.monetaryMass
          b.dividend = block.dividend
        })
    }
    else if (!existing) {
      await this.insert(block)
    }
    return block
  }

  async dropNonForkBlocksAbove(number: number): Promise<void> {
    this.collection
      .chain()
      .find({
        fork: false,
        number: { $gt: number }
      })
      .remove()
  }

  async setSideBlock(number: number, previousBlock: DBBlock | null): Promise<void> {
    this.collection
      .chain()
      .find({
        number
      })
      .update((b:DBBlock) => {
        b.fork = true
      })
    // Also update the cache if concerned
    if (this.current && this.current.number === number) {
      if (previousBlock && this.current.previousHash === previousBlock.hash) {
        this.current = previousBlock
      } else {
        this.current = null
      }
    }
  }

  async getNonForkChunk(start: number, end: number): Promise<DBBlock[]> {
    return this.collection
      .chain()
      .find({
        fork: false,
        number: { $between: [start, end ]}
      })
      .simplesort('number')
      .data()
  }
}
