import {BlockchainArchiveDAO, BlockLike} from "./abstract/BlockchainArchiveDAO"
import {CFSCore} from "../fileDALs/CFSCore"
import {Underscore} from "../../common-libs/underscore"

export class CFSBlockchainArchive<T extends BlockLike> implements BlockchainArchiveDAO<T> {

  constructor(private cfs:CFSCore, private _chunkSize:number) {
  }

  async archive(records: T[]): Promise<number> {
    if (!this.checkBlocksRepresentChunks(records)) {
      return 0
    }
    if (!this.checkBlocksAreWellChained(records)) {
      return 0
    }
    const chunks = this.splitIntoChunks(records)
    for (const c of chunks) {
      const fileName = this.getFileNameForBlock(c[0].number)
      await this.cfs.writeJSON(fileName, c)
    }
    return chunks.length
  }

  private checkBlocksRepresentChunks(records: BlockLike[]): boolean {
    return !(records[0].number % this._chunkSize !== 0 || (records[records.length - 1].number + 1) % this._chunkSize !== 0)

  }

  private checkBlocksAreWellChained(records: T[]): boolean {
    let previous:BlockLike = {
      number: records[0].number - 1,
      hash: records[0].previousHash,
      previousHash: ''
    }
    for (const b of records) {
      if (b.previousHash !== previous.hash || b.number !== previous.number + 1) {
        return false
      }
      previous = b
    }
    return true
  }

  private splitIntoChunks(records: T[]): T[][] {
    const nbChunks = records.length / this._chunkSize
    const chunks: T[][] = []
    for (let i = 0; i < nbChunks; i++) {
      chunks.push(records.slice(i * this._chunkSize, (i + 1) * this._chunkSize))
    }
    return chunks
  }

  async getBlock(number: number, hash: string): Promise<T|null> {
    const block = await this.getBlockByNumber(number)
    if (!block) {
      return null
    }
    return block.hash === hash ? block : null
  }

  async getBlockByNumber(number: number): Promise<T|null> {
    if (number < 0) {
      return null
    }
    const content = await this.getChunkForBlock(number)
    if (!content) {
      // The block's chunk is not archived
      return null
    }
    return content[this.getPositionInChunk(number)]
  }

  async getBlocks(start: number, end: number): Promise<T[]> {
    const chunkStart = this.getChunkNumber(start)
    const chunkLast = this.getChunkNumber(end)
    const chunkRange = Underscore.range(chunkStart, chunkLast + 1)
    const chunks = await Promise.all(chunkRange.map(c => this.getChunk(c)))
    const startInFirst = start - chunkStart * this._chunkSize
    const endInLast = end % this._chunkSize + 1
    let blocks: T[] = []
    for (let i = 0; i < chunks.length; i++) {
      let toConcat: T[] = []
      const chunk = chunks[i]
      if (chunk) {
        if (i === 0) {
          toConcat = chunk.slice(startInFirst, chunkStart === chunkLast ? endInLast : this._chunkSize)
        } else if (i === chunks.length - 1) {
          toConcat = chunk.slice(0, endInLast)
        } else {
          toConcat = chunk.slice()
        }
      }
      blocks = blocks.concat(toConcat)
    }
    return blocks
  }

  async getChunk(number:number): Promise<(T[])|null> {
    const file = this.getFileNameForChunk(number)
    return this.cfs.readJSON(file)
  }

  async getChunkForBlock(number:number): Promise<(T[])|null> {
    const file = this.getFileNameForBlock(number)
    return this.cfs.readJSON(file)
  }

  async getLastSavedBlock(): Promise<T | null> {
    const list = await this.cfs.list('/')
    const max = list
      .map(f => f.replace(`chunk_`, ''))
      .map(f => f.replace(`-${this._chunkSize}.json`, ''))
      .map(f => parseInt(f))
      .reduce((v, max) => {
        return Math.max(v, max)
      }, 0)
    const content = await this.getChunkForBlock(max * this._chunkSize)
    if (!content) {
      return null
    }
    return this.getBlock(content[content.length - 1].number, content[content.length - 1].hash)
  }

  private getFileNameForChunk(number:number) {
    return CFSBlockchainArchive.getChunkName(number, this._chunkSize)
  }

  private getFileNameForBlock(number:number) {
    const chunk = this.getChunkNumber(number)
    return CFSBlockchainArchive.getChunkName(chunk, this._chunkSize)
  }

  private getChunkNumber(number:number) {
    const rest = number % this._chunkSize
    return (number - rest) / this._chunkSize
  }

  private static getChunkName(chunkNumber:number, chunkSize:number) {
    return `chunk_${chunkNumber}-${chunkSize}.json`
  }

  private getPositionInChunk(number:number) {
    return number % this._chunkSize
  }

  async init(): Promise<void> {
    return this.cfs.makeTree('/')
  }

  triggerInit(): void {
    // TODO: remove triggerInit from all the DAOs, it is a wrong implementation
  }

  cleanCache(): void {
    // TODO: is it really useful?
  }

  get chunkSize(): number {
    return this._chunkSize
  }
}
