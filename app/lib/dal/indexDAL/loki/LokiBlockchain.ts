import {BlockchainDAO} from "../abstract/BlockchainDAO"
import {DBBlock} from "../../../db/DBBlock"
import {MonitorLokiExecutionTime} from "../../../debug/MonitorLokiExecutionTime"
import {LokiProtocolIndex} from "./LokiProtocolIndex"
import {MonitorExecutionTime} from "../../../debug/MonitorExecutionTime"

export class LokiBlockchain extends LokiProtocolIndex<DBBlock> implements BlockchainDAO {

  private current:DBBlock|null = null

  constructor(loki:any) {
    super(loki, 'blockchain', ['number', 'hash', 'fork'])
  }

  cleanCache(): void {
    super.cleanCache()
    this.current = null
  }

  @MonitorExecutionTime()
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

  @MonitorExecutionTime()
  @MonitorLokiExecutionTime(true)
  async getBlock(number:string | number) {
    return this.collection
      .chain()
      .find({
        number: parseInt(String(number)),
        fork: false
      })
      .data()[0]
  }

  @MonitorExecutionTime()
  async getPotentialRoots() {
    return this.collection
      .chain()
      .find({ number: 0, fork: true })
      .data()
  }

  @MonitorExecutionTime()
  async saveBunch(blocks:DBBlock[]) {
    return this.insertBatch(blocks)
  }

  @MonitorExecutionTime()
  async insertBatch(records: DBBlock[]): Promise<void> {
    const lastInBatch = records[records.length - 1]
    if (!this.current || this.current.number < lastInBatch.number) {
      this.current = lastInBatch
    }
    return super.insertBatch(records)
  }

  @MonitorExecutionTime()
  async removeBlock(blockstamp: string): Promise<void> {
    // Never remove blocks
  }

  @MonitorExecutionTime()
  async removeForkBlock(number:number): Promise<void> {
    await this.collection
      .chain()
      .find({
        fork: true,
        number
      })
      .remove()
  }

  @MonitorExecutionTime()
  async removeForkBlockAboveOrEqual(number:number): Promise<void> {
    await this.collection
      .chain()
      .find({
        fork: true,
        number: { $gte: number }
      })
      .remove()
  }

  @MonitorExecutionTime()
  async trimBlocks(number:number): Promise<void> {
    await this.collection
      .chain()
      .find({
        number: { $lte: number }
      })
      .remove()
  }

  @MonitorExecutionTime()
  async getAbsoluteBlock(number: number, hash: string): Promise<DBBlock | null> {
    return this.collection
      .chain()
      .find({
        number,
        hash
      })
      .data()[0]
  }

  @MonitorExecutionTime()
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

  @MonitorExecutionTime()
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

  @MonitorExecutionTime()
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

  @MonitorExecutionTime()
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

  @MonitorExecutionTime()
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

  @MonitorExecutionTime()
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

  @MonitorExecutionTime()
  async saveBlock(block: DBBlock): Promise<DBBlock> {
    if (!this.current || this.current.number < block.number) {
      this.current = block;
    }
    return this.insertOrUpdate(block, false)
  }

  @MonitorExecutionTime()
  async saveSideBlock(block: DBBlock): Promise<DBBlock> {
    return this.insertOrUpdate(block, true)
  }

  @MonitorExecutionTime()
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

  @MonitorExecutionTime()
  async dropNonForkBlocksAbove(number: number): Promise<void> {
    this.collection
      .chain()
      .find({
        fork: false,
        number: { $gt: number }
      })
      .remove()
  }

  @MonitorExecutionTime()
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

  @MonitorExecutionTime()
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
